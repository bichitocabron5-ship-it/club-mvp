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
  RecentSale,
  RecentSalesResponse,
  TodayTotals,
} from "@/lib/helpers/sales-cart";
import type { MemberSummary, ProductSummary } from "@/lib/types";

const RFID_SCAN_MIN_LENGTH = 6;
const RFID_SCAN_MAX_KEY_GAP_MS = 50;
const RFID_SCAN_DIGIT_PATTERN = /^\d$/;

type RfidScanBuffer = {
  value: string;
  lastKeyAt: number;
  target: HTMLInputElement | HTMLTextAreaElement | null;
  targetStartValue: string;
};

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rfidInput, setRfidInput] = useState("");
  const [rfidError, setRfidError] = useState("");
  const [cancelingSaleId, setCancelingSaleId] = useState<number | null>(null);

  const rfidRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef(false);
  const rfidSubmittingRef = useRef(false);
  const rfidScanBufferRef = useRef<RfidScanBuffer | null>(null);

  const focusRfidInput = useCallback(() => {
    window.setTimeout(() => {
      rfidRef.current?.focus();
      rfidRef.current?.select();
    }, 0);
  }, []);

  const handleMemberLoadSuccess = useCallback(() => {
    setError("");
  }, []);

  const handleMemberLoadError = useCallback((message: string) => {
    setError(message);
  }, []);

  const focusProductSearchInput = useCallback(() => {
    window.setTimeout(() => {
      productSearchRef.current?.focus();
      productSearchRef.current?.select();
    }, 0);
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
    focusProductSearchInput,
  });

  const productFilters = useSalesProducts({
    products,
    onAddProduct: cart.addProduct,
  });

  const loadRecentSales = useCallback(async () => {
    const data = await fetchJson<RecentSalesResponse>("/api/sales");
    setRecentSales(data.sales);
    setRecentSalesDayClosed(data.dayClosed);
    setRecentSalesError("");
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
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error cargando datos");
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
    loading;

  function handleMemberChange(nextMemberId: string) {
    member.handleMemberChange(nextMemberId);
    cart.clearCart();
  }

  function handleClearMember() {
    member.handleClearMember();
    cart.clearCart();
  }

  async function handleRegisterWithdrawal() {
    if (invalid || submittingRef.current) return;

    submittingRef.current = true;
    const selectedMemberId = member.memberId;

    const items = cart.cartLines
      .filter((line) => !line.conversionError)
      .map((line) => ({
        productId: line.productId,
        qty: line.qty,
      }))
      .filter((item) => item.qty > 0);

    if (items.length !== cart.cart.length) {
      alert("Hay lineas con errores de conversion. Revisa el carrito antes de enviar.");
      submittingRef.current = false;
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sales/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: Number(selectedMemberId),
          items,
        }),
      });

      if (!res.ok) {
        const err: { error?: string } = await res.json();
        alert(err.error || "Error al registrar retirada");
        return;
      }

      alert("Retirada registrada");

      cart.clearCart();

      const refreshedProducts = await fetchJson<ProductSummary[]>("/api/products");
      setProducts(refreshedProducts);

      const refreshedToday = await fetchJson<TodayTotals>(
        `/api/members/${selectedMemberId}/today`
      );
      member.setToday(refreshedToday);
      await member.loadMemberRecentSales(selectedMemberId);
      await loadRecentSales();

      setRfidInput("");

      setTimeout(() => {
        productSearchRef.current?.focus();
      }, 0);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al registrar retirada");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleCancelRecentSale(sale: RecentSale) {
    if (!sale.canCancel || recentSalesDayClosed || cancelingSaleId !== null) {
      return;
    }

    const reason = window.prompt(`Motivo para anular la retirada #${sale.id}`);

    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      alert("El motivo es obligatorio para anular una retirada.");
      return;
    }

    const confirmed = window.confirm(
      `Anular retirada #${sale.id} de ${sale.member.fullName}?`
    );

    if (!confirmed) {
      return;
    }

    setCancelingSaleId(sale.id);

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

      const refreshedProducts = await fetchJson<ProductSummary[]>("/api/products");
      setProducts(refreshedProducts);

      if (member.memberId) {
        const refreshedToday = await fetchJson<TodayTotals>(
          `/api/members/${member.memberId}/today`
        );
        member.setToday(refreshedToday);
        await member.loadMemberRecentSales(member.memberId);
      }

      await loadRecentSales();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error anulando retirada");
    } finally {
      setCancelingSaleId(null);
    }
  }

  async function processRfidCode(rawCode: string) {
    const code = normalizeRfidCode(rawCode);
    if (!code || rfidSubmittingRef.current) return;

    rfidSubmittingRef.current = true;
    setRfidError("");

    try {
      const res = await fetch(`/api/members/by-rfid/${encodeURIComponent(code)}`);

      if (!res.ok) {
        setRfidError("Chapita no asignada");
        setRfidInput("");
        focusRfidInput();
        return;
      }

      const selectedMember = (await res.json()) as MemberSummary;

      member.setMemberId(String(selectedMember.id));
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

    await processRfidCode(rfidInput);
  }

  function handleRfidScannerKeyDownCapture(
    event: ReactKeyboardEvent<HTMLElement>
  ) {
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
    loading,
    memberId: member.memberId,
    memberRecentSalesError: member.memberRecentSalesError,
    memberRecentSalesLoading: member.memberRecentSalesLoading,
    memberRecentSummary: member.memberRecentSummary,
    memberSearch: member.memberSearch,
    memberStatus: member.memberStatus,
    productCategories: productFilters.productCategories,
    productSearchRef,
    recentSales,
    recentSalesDayClosed,
    recentSalesError,
    rfidError,
    rfidInput,
    rfidRef,
    search: productFilters.search,
    selectedCategory: productFilters.selectedCategory,
    selectedHashType: productFilters.selectedHashType,
    showRecentSales,
    visibleToday: member.visibleToday,
    addProduct: cart.addProduct,
    handleCancelRecentSale,
    handleCartValueKeyDown: cart.handleCartValueKeyDown,
    handleCategoryFilter: productFilters.handleCategoryFilter,
    handleClearMember,
    handleHashTypeFilter: productFilters.handleHashTypeFilter,
    handleMemberChange,
    handleProductSearchKeyDown: productFilters.handleProductSearchKeyDown,
    handleRefreshRecentSales,
    handleRegisterButtonKeyDown: cart.handleRegisterButtonKeyDown,
    handleRegisterWithdrawal,
    handleRfidScannerKeyDownCapture,
    handleRfidSubmit,
    focusRfidInput,
    removeProduct: cart.removeProduct,
    setCartValueInputRef: cart.setCartValueInputRef,
    setMemberSearch: member.setMemberSearch,
    setRfidInput,
    setSearch: productFilters.setSearch,
    setShowRecentSales,
    updateAmount: cart.updateAmount,
    updateInputMode: cart.updateInputMode,
    updateQty: cart.updateQty,
  };
}
