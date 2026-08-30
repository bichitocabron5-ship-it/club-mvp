"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { useSalesCart } from "@/hooks/use-sales-cart";
import { useSalesMember } from "@/hooks/use-sales-member";
import { useSalesProducts } from "@/hooks/use-sales-products";
import { fetchJson } from "@/lib/fetch-json";
import { getSalesCartTotals } from "@/lib/helpers/sales-cart";
import { normalizeRfidCode } from "@/lib/rfid";
import type {
  AddProductOptions,
  CartInputMode,
  RecentSale,
  RecentSalesResponse,
  TodayTotals,
} from "@/lib/helpers/sales-cart";
import type {
  MemberSummary,
  ProductHashType,
  ProductSummary,
} from "@/lib/types";

const RFID_SCAN_MIN_LENGTH = 6;
const RFID_SCAN_MAX_KEY_GAP_MS = 50;
const RFID_SCAN_DIGIT_PATTERN = /^\d$/;
const WITHDRAWAL_SUCCESS_FEEDBACK_MS = 4000;
const WITHDRAWAL_ERROR_FEEDBACK_MS = 12000;
const WITHDRAWAL_SYNC_WARNING_FEEDBACK_MS = 12000;
const AMBIGUOUS_WITHDRAWAL_ERROR_MESSAGE =
  "No se pudo confirmar el registro. Reintenta sin modificar la retirada para comprobarla de forma segura.";

type WithdrawalFeedback = {
  kind: "success" | "error";
  title: string;
  message: string;
};

type RfidScanBuffer = {
  value: string;
  lastKeyAt: number;
  target: HTMLInputElement | HTMLTextAreaElement | null;
  targetStartValue: string;
};

type CancelledSaleResponse = {
  cancelledAt?: unknown;
  cancelReason?: unknown;
  productId?: unknown;
  product?: {
    id?: unknown;
  } | null;
};

type WithdrawalRegistrationItem = {
  productId: number;
  qty: number;
};

type WithdrawalRegistrationPayload = {
  memberId: number;
  items: WithdrawalRegistrationItem[];
};

type PendingWithdrawalAttempt = {
  idempotencyKey: string;
  payloadSignature: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePositiveInteger(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getCancelledSaleProductId(value: unknown) {
  if (!isRecord(value)) return null;

  const directProductId = parsePositiveInteger(value.productId);
  if (directProductId !== null) return directProductId;

  const product = value.product;
  if (!isRecord(product)) return null;

  return parsePositiveInteger(product.id);
}

function getOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getCancelledSaleCancelledAt(value: unknown) {
  if (!isRecord(value)) return null;

  return getOptionalString(value.cancelledAt);
}

function getCancelledSaleReason(value: unknown) {
  if (!isRecord(value)) return null;
  if (value.cancelReason === null) return null;

  return getOptionalString(value.cancelReason);
}

function normalizeWithdrawalItemsForAttempt(
  items: WithdrawalRegistrationItem[]
) {
  const grouped = new Map<number, number>();

  for (const item of items) {
    grouped.set(item.productId, (grouped.get(item.productId) || 0) + item.qty);
  }

  return Array.from(grouped.entries())
    .sort(([leftProductId], [rightProductId]) => leftProductId - rightProductId)
    .map(([productId, qty]) => ({
      productId,
      qty,
    }));
}

function getWithdrawalPayloadSignature(payload: WithdrawalRegistrationPayload) {
  return JSON.stringify({
    version: 1,
    operationType: "BULK",
    memberId: payload.memberId,
    items: normalizeWithdrawalItemsForAttempt(payload.items),
    manualDiscount: null,
    note: null,
  });
}

function createWithdrawalIdempotencyKey() {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID !== "function") {
    throw new Error(
      "No se pudo preparar el registro seguro. Actualiza el navegador."
    );
  }

  return randomUUID.call(globalThis.crypto);
}

function isConfirmedWithdrawalFailureStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408;
}

async function getRegistrationErrorMessage(res: Response, fallback: string) {
  const err = (await res.json().catch(() => null)) as
    | { error?: unknown }
    | null;
  const message = typeof err?.error === "string" ? err.error.trim() : "";

  return message || fallback;
}

function getEditableScanTarget(
  target: EventTarget
): HTMLInputElement | HTMLTextAreaElement | null {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    if (target.disabled || target.readOnly) return null;
    return target;
  }

  return null;
}

function restoreEditableTargetValue(
  target: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (valueSetter) {
    valueSetter.call(target, value);
  } else {
    target.value = value;
  }

  target.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useSalesPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentSalesDayClosed, setRecentSalesDayClosed] = useState(false);
  const [recentSalesError, setRecentSalesError] = useState("");
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [memberLoadError, setMemberLoadError] = useState("");
  const [registerMutationPending, setRegisterMutationPending] = useState(false);
  const [rfidInput, setRfidInput] = useState("");
  const [rfidError, setRfidError] = useState("");
  const [cancelingSaleId, setCancelingSaleId] = useState<number | null>(null);
  const [withdrawalFeedback, setWithdrawalFeedback] =
    useState<WithdrawalFeedback | null>(null);

  const rfidRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const registerButtonRef = useRef<HTMLButtonElement | null>(null);
  const submittingRef = useRef(false);
  const rfidSubmittingRef = useRef(false);
  const cancelingSaleRef = useRef(false);
  const rfidScanBufferRef = useRef<RfidScanBuffer | null>(null);
  const cancelDialogOpenRef = useRef(false);
  const withdrawalFeedbackTimerRef = useRef<number | null>(null);
  const pendingWithdrawalAttemptRef = useRef<PendingWithdrawalAttempt | null>(
    null
  );
  const mountedRef = useRef(true);
  const currentMemberIdRef = useRef("");
  const memberContextVersionRef = useRef(0);

  // Idempotency lifecycle: no key creates a new attempt, ambiguous errors keep
  // the key, confirmed server failures and success clear it, payload changes
  // invalidate it before the next logical withdrawal.
  const clearPendingWithdrawalAttempt = useCallback(() => {
    pendingWithdrawalAttemptRef.current = null;
  }, []);

  const invalidatePendingWithdrawalAttempt = clearPendingWithdrawalAttempt;

  const getWithdrawalIdempotencyKey = useCallback(
    (payloadSignature: string) => {
      const pendingAttempt = pendingWithdrawalAttemptRef.current;

      if (pendingAttempt?.payloadSignature === payloadSignature) {
        return pendingAttempt.idempotencyKey;
      }

      const nextAttempt = {
        idempotencyKey: createWithdrawalIdempotencyKey(),
        payloadSignature,
      };

      pendingWithdrawalAttemptRef.current = nextAttempt;
      return nextAttempt.idempotencyKey;
    },
    []
  );

  const clearWithdrawalFeedback = useCallback(() => {
    if (withdrawalFeedbackTimerRef.current !== null) {
      window.clearTimeout(withdrawalFeedbackTimerRef.current);
      withdrawalFeedbackTimerRef.current = null;
    }

    if (mountedRef.current) {
      setWithdrawalFeedback(null);
    }
  }, []);

  const showWithdrawalFeedback = useCallback(
    (feedback: WithdrawalFeedback, visibleMs: number) => {
      if (!mountedRef.current) return;

      if (withdrawalFeedbackTimerRef.current !== null) {
        window.clearTimeout(withdrawalFeedbackTimerRef.current);
        withdrawalFeedbackTimerRef.current = null;
      }

      setWithdrawalFeedback(feedback);

      withdrawalFeedbackTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) {
          withdrawalFeedbackTimerRef.current = null;
          return;
        }

        setWithdrawalFeedback(null);
        withdrawalFeedbackTimerRef.current = null;
      }, visibleMs);
    },
    []
  );

  const clearRfidScanBuffer = useCallback(() => {
    rfidScanBufferRef.current = null;
  }, []);

  const setCancelDialogOpen = useCallback((isOpen: boolean) => {
    cancelDialogOpenRef.current = isOpen;
    clearRfidScanBuffer();
  }, [clearRfidScanBuffer]);

  const focusRfidInput = useCallback(() => {
    rfidRef.current?.focus();
    rfidRef.current?.select();

    window.setTimeout(() => {
      rfidRef.current?.focus();
      rfidRef.current?.select();
    }, 0);
  }, []);

  const updateCurrentMemberContext = useCallback((nextMemberId: string) => {
    const normalizedMemberId = nextMemberId.trim();

    if (currentMemberIdRef.current !== normalizedMemberId) {
      memberContextVersionRef.current += 1;
    }

    currentMemberIdRef.current = normalizedMemberId;
  }, []);

  const handleMemberLoadSuccess = useCallback(() => {
    setMemberLoadError("");
  }, []);

  const handleMemberLoadError = useCallback((message: string) => {
    setMemberLoadError(message);
  }, []);

  const focusProductSearchInput = useCallback(() => {
    productSearchRef.current?.focus();
    productSearchRef.current?.select();

    window.setTimeout(() => {
      productSearchRef.current?.focus();
      productSearchRef.current?.select();
    }, 0);
  }, []);

  const focusRegisterButton = useCallback(() => {
    const focusButton = () => {
      const button = registerButtonRef.current;
      if (!button || button.disabled) return;

      button.focus();
    };

    focusButton();
    window.setTimeout(focusButton, 0);
  }, []);

  const member = useSalesMember({
    members,
    onMemberLoadError: handleMemberLoadError,
    onMemberLoadSuccess: handleMemberLoadSuccess,
    rfidRef,
  });

  const cart = useSalesCart({
    products,
    discountPercent: Number(member.memberStatus?.member.discountPercent || 0),
    focusRegisterButton,
    registerMutationPending,
  });

  function handleAddProduct(
    product: ProductSummary,
    options?: AddProductOptions
  ) {
    if (submittingRef.current) return false;

    clearWithdrawalFeedback();
    const added = cart.addProduct(product, options);

    if (added) {
      invalidatePendingWithdrawalAttempt();
    }

    return added;
  }

  const productFilters = useSalesProducts({
    disabled: registerMutationPending,
    products,
    onAddProduct: handleAddProduct,
  });

  const error = bootstrapError || memberLoadError;

  const loadRecentSales = useCallback(async () => {
    const data = await fetchJson<RecentSalesResponse>("/api/sales");
    setRecentSales(data.sales);
    setRecentSalesDayClosed(data.dayClosed);
    setRecentSalesError("");
  }, []);

  useEffect(() => {
    updateCurrentMemberContext(member.memberId);
  }, [member.memberId, updateCurrentMemberContext]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (withdrawalFeedbackTimerRef.current !== null) {
        window.clearTimeout(withdrawalFeedbackTimerRef.current);
        withdrawalFeedbackTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (member.memberId) {
        productSearchRef.current?.focus();
        return;
      }

      rfidRef.current?.focus();
      rfidRef.current?.select();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [member.memberId]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchJson<MemberSummary[]>("/api/members"),
      fetchJson<ProductSummary[]>("/api/products"),
    ])
      .then(([membersData, productsData]) => {
        if (!cancelled) {
          setMembers(membersData);
          setProducts(productsData);
          setBootstrapError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBootstrapError(
            err instanceof Error ? err.message : "Error cargando datos"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchJson<RecentSalesResponse>("/api/sales")
      .then((data) => {
        if (!cancelled) {
          setRecentSales(data.sales);
          setRecentSalesDayClosed(data.dayClosed);
          setRecentSalesError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRecentSalesError(
            err instanceof Error ? err.message : "Error cargando retiradas"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const cartTotals = useMemo(
    () => getSalesCartTotals(cart.cartLines, member.visibleToday),
    [cart.cartLines, member.visibleToday]
  );

  const invalid =
    !member.memberId ||
    !member.memberStatus?.canWithdraw ||
    cart.cart.length === 0 ||
    cartTotals.overGrams ||
    cartTotals.overUnits ||
    cartTotals.overMonthly ||
    cartTotals.conversionProblems.length > 0 ||
    cartTotals.stockProblems.length > 0 ||
    member.memberStatusLoading ||
    registerMutationPending;

  function handleMemberChange(nextMemberId: string) {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    updateCurrentMemberContext(nextMemberId);
    member.handleMemberChange(nextMemberId);
    cart.clearCart();
  }

  function handleNextMember() {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    updateCurrentMemberContext("");
    member.handleClearMember();
    cart.clearCart();
    productFilters.resetProductFilters();
    setRfidInput("");
    setRfidError("");
    setMemberLoadError("");
    focusRfidInput();
  }

  function handleMemberSearchChange(value: string) {
    if (submittingRef.current) return;

    clearWithdrawalFeedback();
    member.setMemberSearch(value);
  }

  function handleMemberSearchKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>
  ) {
    if (event.key !== "Enter" && event.code !== "NumpadEnter") return;
    if (event.nativeEvent.isComposing) return;

    if (submittingRef.current) {
      event.preventDefault();
      return;
    }

    const [uniqueMember] = member.filteredMembers;

    if (!uniqueMember || member.filteredMembers.length !== 1) {
      return;
    }

    event.preventDefault();

    const nextMemberId = String(uniqueMember.id);
    member.setMemberSearch(uniqueMember.fullName);

    if (nextMemberId === member.memberId.trim()) {
      focusProductSearchInput();
      return;
    }

    handleMemberChange(nextMemberId);
  }

  function handleRfidInputChange(value: string) {
    if (submittingRef.current) {
      clearRfidScanBuffer();
      return;
    }

    clearWithdrawalFeedback();
    setRfidInput(value);
  }

  function handleSearchChange(value: string) {
    if (submittingRef.current) return;

    clearWithdrawalFeedback();
    productFilters.setSearch(value);
  }

  function handleCategoryFilter(category: string) {
    if (submittingRef.current) return;

    clearWithdrawalFeedback();
    productFilters.handleCategoryFilter(category);
  }

  function handleHashTypeFilter(hashType: ProductHashType | "ALL") {
    if (submittingRef.current) return;

    clearWithdrawalFeedback();
    productFilters.handleHashTypeFilter(hashType);
  }

  function handleRemoveProduct(productId: number) {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    cart.removeProduct(productId);
  }

  function handleUpdateAmount(productId: number, value: string) {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    cart.updateAmount(productId, value);
  }

  function handleUpdateInputMode(productId: number, inputMode: CartInputMode) {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    cart.updateInputMode(productId, inputMode);
  }

  function handleUpdateQty(productId: number, value: string) {
    if (submittingRef.current) return;

    invalidatePendingWithdrawalAttempt();
    clearWithdrawalFeedback();
    cart.updateQty(productId, value);
  }

  function handleCartValueKeyDown(
    productId: number,
    event: ReactKeyboardEvent<HTMLInputElement>
  ) {
    if (
      submittingRef.current &&
      (event.key === "Enter" || event.code === "NumpadEnter")
    ) {
      event.preventDefault();
      return;
    }

    cart.handleCartValueKeyDown(productId, event);
  }

  async function synchronizeAfterSuccessfulWithdrawal({
    isWithdrawalContextCurrent,
    selectedMemberId,
    showFeedbackIfWithdrawalContextCurrent,
  }: {
    isWithdrawalContextCurrent: () => boolean;
    selectedMemberId: string;
    showFeedbackIfWithdrawalContextCurrent: (
      feedback: WithdrawalFeedback,
      visibleMs: number
    ) => void;
  }) {
    let refreshFailed = false;

    try {
      const refreshedProducts = await fetchJson<ProductSummary[]>("/api/products");
      setProducts(refreshedProducts);
    } catch {
      refreshFailed = true;
    }

    if (selectedMemberId && isWithdrawalContextCurrent()) {
      try {
        await member.loadMemberOperationalData(selectedMemberId, {
          reportLoadErrors: false,
        });
      } catch {
        refreshFailed = true;
      }

      try {
        await member.loadMemberRecentSales(selectedMemberId);
      } catch {
        refreshFailed = true;
      }
    }

    try {
      await loadRecentSales();
    } catch {
      refreshFailed = true;
    }

    if (refreshFailed) {
      showFeedbackIfWithdrawalContextCurrent(
        {
          kind: "success",
          title: "Retirada registrada",
          message:
            "Retirada registrada, pero no se pudieron actualizar todos los datos. Pulsa Actualizar para sincronizar.",
        },
        WITHDRAWAL_SYNC_WARNING_FEEDBACK_MS
      );
    }
  }

  async function handleRegisterWithdrawal() {
    if (submittingRef.current) return;

    clearWithdrawalFeedback();

    if (cartTotals.conversionProblems.length > 0) {
      showWithdrawalFeedback(
        {
          kind: "error",
          title: "Revisa el carrito",
          message:
            "Hay líneas con errores de conversión. Revisa el carrito antes de registrar.",
        },
        WITHDRAWAL_ERROR_FEEDBACK_MS
      );
      return;
    }

    if (invalid) return;

    const selectedMemberId = member.memberId.trim();
    const selectedMemberContextVersion = memberContextVersionRef.current;
    const isWithdrawalContextCurrent = () =>
      currentMemberIdRef.current === selectedMemberId &&
      memberContextVersionRef.current === selectedMemberContextVersion;
    const showFeedbackIfWithdrawalContextCurrent = (
      feedback: WithdrawalFeedback,
      visibleMs: number
    ) => {
      if (!isWithdrawalContextCurrent()) return;

      showWithdrawalFeedback(feedback, visibleMs);
    };

    const items = cart.cartLines
      .filter((line) => !line.conversionError)
      .map((line) => ({
        productId: line.productId,
        qty: line.qty,
      }))
      .filter((item) => item.qty > 0);

    if (items.length !== cart.cart.length) {
      showWithdrawalFeedback(
        {
          kind: "error",
          title: "Revisa el carrito",
          message:
            "Hay líneas con errores de conversión. Revisa el carrito antes de registrar.",
        },
        WITHDRAWAL_ERROR_FEEDBACK_MS
      );
      return;
    }

    const registrationPayload: WithdrawalRegistrationPayload = {
      memberId: Number(selectedMemberId),
      items,
    };
    const payloadSignature =
      getWithdrawalPayloadSignature(registrationPayload);
    let idempotencyKey: string;

    try {
      idempotencyKey = getWithdrawalIdempotencyKey(payloadSignature);
    } catch (err) {
      clearPendingWithdrawalAttempt();
      showFeedbackIfWithdrawalContextCurrent(
        {
          kind: "error",
          title: "No se pudo registrar la retirada",
          message:
            err instanceof Error ? err.message : "Error al preparar retirada",
        },
        WITHDRAWAL_ERROR_FEEDBACK_MS
      );
      return;
    }

    submittingRef.current = true;
    setRegisterMutationPending(true);

    try {
      const res = await fetch("/api/sales/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...registrationPayload,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const message = await getRegistrationErrorMessage(
          res,
          "Error al registrar retirada"
        );

        if (isConfirmedWithdrawalFailureStatus(res.status)) {
          clearPendingWithdrawalAttempt();
          showFeedbackIfWithdrawalContextCurrent(
            {
              kind: "error",
              title: "No se pudo registrar la retirada",
              message,
            },
            WITHDRAWAL_ERROR_FEEDBACK_MS
          );
          return;
        }

        showFeedbackIfWithdrawalContextCurrent(
          {
            kind: "error",
            title: "No se pudo confirmar el registro",
            message: AMBIGUOUS_WITHDRAWAL_ERROR_MESSAGE,
          },
          WITHDRAWAL_ERROR_FEEDBACK_MS
        );
        return;
      }

      clearPendingWithdrawalAttempt();
    } catch {
      showFeedbackIfWithdrawalContextCurrent(
        {
          kind: "error",
          title: "No se pudo confirmar el registro",
          message: AMBIGUOUS_WITHDRAWAL_ERROR_MESSAGE,
        },
        WITHDRAWAL_ERROR_FEEDBACK_MS
      );
      return;
    } finally {
      submittingRef.current = false;
      setRegisterMutationPending(false);
    }

    try {
      showFeedbackIfWithdrawalContextCurrent(
        {
          kind: "success",
          title: "Retirada registrada",
          message: "La retirada se ha guardado correctamente.",
        },
        WITHDRAWAL_SUCCESS_FEEDBACK_MS
      );

      if (isWithdrawalContextCurrent()) {
        cart.clearCart();
        setRfidInput("");
        focusProductSearchInput();
      }

      await synchronizeAfterSuccessfulWithdrawal({
        isWithdrawalContextCurrent,
        selectedMemberId,
        showFeedbackIfWithdrawalContextCurrent,
      });
    } catch {
      showFeedbackIfWithdrawalContextCurrent(
        {
          kind: "success",
          title: "Retirada registrada",
          message:
            "Retirada registrada, pero no se pudieron actualizar todos los datos. Pulsa Actualizar para sincronizar.",
        },
        WITHDRAWAL_SYNC_WARNING_FEEDBACK_MS
      );
    }
  }

  function handleRegisterButtonKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) {
    const isRegisterActivationKey =
      event.key === "Enter" ||
      event.code === "NumpadEnter" ||
      event.key === " " ||
      event.key === "Spacebar";

    if (!isRegisterActivationKey) return;

    event.preventDefault();

    if (
      event.repeat ||
      event.currentTarget !== document.activeElement ||
      invalid ||
      registerMutationPending ||
      submittingRef.current
    ) {
      return;
    }

    void handleRegisterWithdrawal();
  }

  async function handleCancelRecentSale(sale: RecentSale, reason: string) {
    const trimmedReason = reason.trim();
    const selectedMemberId = member.memberId.trim();
    const selectedMemberContextVersion = memberContextVersionRef.current;
    const isCancellationContextCurrent = () =>
      currentMemberIdRef.current === selectedMemberId &&
      memberContextVersionRef.current === selectedMemberContextVersion;

    if (!sale.canCancel || recentSalesDayClosed) {
      const message = "No se puede anular esta retirada.";
      setRecentSalesError(message);
      throw new Error(message);
    }

    if (cancelingSaleRef.current) {
      return;
    }

    if (!trimmedReason) {
      const message = "El motivo es obligatorio para anular una retirada.";
      setRecentSalesError(message);
      throw new Error(message);
    }

    cancelingSaleRef.current = true;
    setCancelingSaleId(sale.id);
    setRecentSalesError("");

    let cancelledSale: CancelledSaleResponse | null = null;

    try {
      const res = await fetch(`/api/sales/${sale.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: trimmedReason,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error || "No se pudo anular la retirada");
      }

      cancelledSale = (await res.json().catch(() => null)) as
        | CancelledSaleResponse
        | null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error anulando retirada";
      setRecentSalesError(message);
      throw new Error(message);
    } finally {
      cancelingSaleRef.current = false;
      setCancelingSaleId(null);
    }

    const cancelledAt =
      getCancelledSaleCancelledAt(cancelledSale) ?? new Date().toISOString();
    const cancelReason =
      getCancelledSaleReason(cancelledSale) ?? trimmedReason;
    const cancelledProductId = getCancelledSaleProductId(cancelledSale);

    setRecentSales((currentSales) =>
      currentSales.map((currentSale) =>
        currentSale.id === sale.id
          ? {
              ...currentSale,
              cancelledAt,
              cancelReason,
              canCancel: false,
            }
          : currentSale
      )
    );

    void refreshAfterSuccessfulCancellation();

    async function refreshAfterSuccessfulCancellation() {
      let refreshFailed = false;

      try {
        const refreshedProducts =
          await fetchJson<ProductSummary[]>("/api/products");

        if (isCancellationContextCurrent()) {
          setProducts(refreshedProducts);
        } else if (cancelledProductId !== null) {
          const refreshedProduct = refreshedProducts.find(
            (product) => product.id === cancelledProductId
          );

          if (refreshedProduct) {
            setProducts((currentProducts) => {
              let productWasUpdated = false;
              const nextProducts = currentProducts.map((product) => {
                if (product.id !== refreshedProduct.id) return product;

                productWasUpdated = true;

                if (product.stock === refreshedProduct.stock) {
                  return product;
                }

                return {
                  ...product,
                  stock: refreshedProduct.stock,
                };
              });

              return productWasUpdated ? nextProducts : currentProducts;
            });
          }
        }
      } catch {
        refreshFailed = true;
      }

      if (selectedMemberId && isCancellationContextCurrent()) {
        try {
          const refreshedToday = await fetchJson<TodayTotals>(
            `/api/members/${selectedMemberId}/today`
          );
          member.setTodayForMember(selectedMemberId, refreshedToday);
          await member.loadMemberRecentSales(selectedMemberId);
        } catch {
          refreshFailed = true;
        }
      }

      try {
        await loadRecentSales();
      } catch {
        refreshFailed = true;
      }

      if (refreshFailed) {
        setRecentSalesError(
          "Anulacion completada, pero no se pudieron actualizar todos los datos. Pulsa Actualizar para sincronizar."
        );
      }
    }
  }

  async function processRfidCode(rawCode: string) {
    const code = normalizeRfidCode(rawCode);
    if (!code || rfidSubmittingRef.current || submittingRef.current) {
      clearRfidScanBuffer();
      return;
    }

    rfidSubmittingRef.current = true;
    clearWithdrawalFeedback();
    setRfidError("");

    try {
      const res = await fetch(`/api/members/by-rfid/${encodeURIComponent(code)}`);

      if (submittingRef.current) {
        clearRfidScanBuffer();
        return;
      }

      if (!res.ok) {
        setRfidError("Chapita no asignada");
        setRfidInput("");
        focusRfidInput();
        return;
      }

      const selectedMember = (await res.json()) as MemberSummary;

      if (submittingRef.current) {
        clearRfidScanBuffer();
        return;
      }

      const nextMemberId = String(selectedMember.id);

      invalidatePendingWithdrawalAttempt();
      updateCurrentMemberContext(nextMemberId);
      member.setMemberId(nextMemberId);
      member.setMemberSearch(selectedMember.fullName);
      cart.clearCart();
      setRfidInput("");

      focusProductSearchInput();
    } finally {
      rfidSubmittingRef.current = false;
    }
  }

  async function handleRfidSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      clearRfidScanBuffer();
      return;
    }

    await processRfidCode(rfidInput);
  }

  function handleRfidScannerKeyDownCapture(
    event: ReactKeyboardEvent<HTMLElement>
  ) {
    if (submittingRef.current || registerMutationPending) {
      clearRfidScanBuffer();

      if (
        RFID_SCAN_DIGIT_PATTERN.test(event.key) ||
        event.key === "Enter" ||
        event.code === "NumpadEnter"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }

      return;
    }

    if (cancelDialogOpenRef.current) {
      clearRfidScanBuffer();
      return;
    }

    if (event.target === productSearchRef.current) {
      // Product search and RFID are separate namespaces; focused product input
      // owns numeric SKU/barcode strings even when the same string is an RFID.
      clearRfidScanBuffer();
      return;
    }

    if (
      event.defaultPrevented ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    ) {
      rfidScanBufferRef.current = null;
      return;
    }

    if (event.key === "Enter") {
      const buffer = rfidScanBufferRef.current;
      rfidScanBufferRef.current = null;

      if (!buffer) return;

      const code = normalizeRfidCode(buffer.value);
      const enterGap = event.timeStamp - buffer.lastKeyAt;
      const looksLikeRfidScan =
        code.length >= RFID_SCAN_MIN_LENGTH &&
        code === buffer.value &&
        enterGap <= RFID_SCAN_MAX_KEY_GAP_MS;

      if (!looksLikeRfidScan) return;

      event.preventDefault();
      event.stopPropagation();

      if (buffer.target) {
        restoreEditableTargetValue(buffer.target, buffer.targetStartValue);
      }

      void processRfidCode(code);
      return;
    }

    if (!RFID_SCAN_DIGIT_PATTERN.test(event.key)) {
      rfidScanBufferRef.current = null;
      return;
    }

    const currentTarget = getEditableScanTarget(event.target);
    const previousBuffer = rfidScanBufferRef.current;
    const keyGap = previousBuffer
      ? event.timeStamp - previousBuffer.lastKeyAt
      : Number.POSITIVE_INFINITY;

    if (
      !previousBuffer ||
      previousBuffer.target !== currentTarget ||
      keyGap > RFID_SCAN_MAX_KEY_GAP_MS
    ) {
      rfidScanBufferRef.current = {
        value: event.key,
        lastKeyAt: event.timeStamp,
        target: currentTarget,
        targetStartValue: currentTarget?.value ?? "",
      };
      return;
    }

    rfidScanBufferRef.current = {
      ...previousBuffer,
      value: previousBuffer.value + event.key,
      lastKeyAt: event.timeStamp,
    };
  }

  function handleRefreshRecentSales() {
    void loadRecentSales().catch((err) => {
      setRecentSalesError(
        err instanceof Error ? err.message : "Error cargando retiradas"
      );
    });
  }

  return {
    availableHashTypes: productFilters.availableHashTypes,
    cancelingSaleId,
    cartLines: cart.cartLines,
    cartTotals,
    error,
    filteredMembers: member.filteredMembers,
    filteredProducts: productFilters.filteredProducts,
    invalid,
    registerMutationPending,
    memberId: member.memberId,
    memberRecentSalesError: member.memberRecentSalesError,
    memberRecentSalesLoading: member.memberRecentSalesLoading,
    memberRecentSummary: member.memberRecentSummary,
    memberSearch: member.memberSearch,
    memberStatus: member.memberStatus,
    memberStatusLoading: member.memberStatusLoading,
    productCategories: productFilters.productCategories,
    productSearchRef,
    recentSales,
    recentSalesDayClosed,
    recentSalesError,
    rfidError,
    rfidInput,
    rfidRef,
    registerButtonRef,
    search: productFilters.search,
    selectedCategory: productFilters.selectedCategory,
    selectedHashType: productFilters.selectedHashType,
    showRecentSales,
    visibleToday: member.visibleToday,
    withdrawalFeedback,
    addProduct: handleAddProduct,
    handleCancelRecentSale,
    handleCartValueKeyDown,
    handleCategoryFilter,
    handleHashTypeFilter,
    handleMemberChange,
    handleMemberSearchKeyDown,
    handleNextMember,
    handleProductSearchKeyDown: productFilters.handleProductSearchKeyDown,
    handleRefreshRecentSales,
    handleRegisterButtonKeyDown,
    handleRegisterWithdrawal,
    handleRfidScannerKeyDownCapture,
    handleRfidSubmit,
    focusRfidInput,
    removeProduct: handleRemoveProduct,
    setCartValueInputRef: cart.setCartValueInputRef,
    setMemberSearch: handleMemberSearchChange,
    setRfidInput: handleRfidInputChange,
    setSearch: handleSearchChange,
    setCancelDialogOpen,
    setShowRecentSales,
    updateAmount: handleUpdateAmount,
    updateInputMode: handleUpdateInputMode,
    updateQty: handleUpdateQty,
  };
}
