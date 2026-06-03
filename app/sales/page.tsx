"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { fetchJson } from "@/lib/fetch-json";
import { PRODUCT_HASH_TYPES } from "@/lib/types";
import type { MemberSummary, ProductHashType, ProductSummary } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TodayTotals = {
  grams: number;
  units: number;
  monthlyGrams: number;
  limits: {
    dailyLimitG: number;
    dailyLimitUd: number;
    monthlyLimitG: number | null;
  };
};

type CartInputMode = "QTY" | "AMOUNT";

type CartItem = {
  productId: number;
  inputMode: CartInputMode;
  qtyInput: string;
  amountInput: string;
};

type RecentSale = {
  id: number;
  qty: number;
  totalAmount: number;
  finalAmount: number | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  canCancel: boolean;
  member: {
    fullName: string;
  };
  product: {
    name: string;
    unit: ProductSummary["unit"] | string;
  };
};

type RecentSalesResponse = {
  role: string;
  day: string;
  dayClosed: boolean;
  sales: RecentSale[];
};

type AddProductOptions = {
  focusInput?: boolean;
};

type MemberOperationalStatus = {
  member: MemberSummary & {
    active: boolean;
    expiresAt: string | null;
  };
  hasContract: boolean;
  contract: {
    monthlyLimitG: number | null;
  } | null;
  expired: boolean;
  canWithdraw: boolean;
  reasons: {
    inactive: boolean;
    noContract: boolean;
    expired: boolean;
  };
};

const PRODUCT_CATEGORIES = [
  { value: "ALL", label: "Todo" },
  { value: "CANNABIS", label: "Cannabis" },
  { value: "SATIVA", label: "Sativa" },
  { value: "INDICA", label: "Índica" },
  { value: "HYBRID", label: "Híbrida" },
  { value: "CBD", label: "CBD" },
  { value: "RESIN", label: "Resina" },
  { value: "HASH", label: "Hash" },
  { value: "JOINT", label: "Joints" },
  { value: "DRINK", label: "Bebidas" },
  { value: "FOOD", label: "Comida" },
  { value: "MERCH", label: "Merch" },
];

const hashTypeLabelMap = new Map(
  PRODUCT_HASH_TYPES.map((hashType) => [hashType.value, hashType.label])
);

const categoryLabelMap = new Map(
  PRODUCT_CATEGORIES.map((category) => [category.value, category.label])
);

const emptyToday: TodayTotals = {
  grams: 0,
  units: 0,
  monthlyGrams: 0,
  limits: {
    dailyLimitG: 10,
    dailyLimitUd: 15,
    monthlyLimitG: null,
  },
};

const QTY_DECIMALS_G = 3;
const QTY_EPSILON = 0.000001;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeDiscountPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function roundQty(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return Math.round(value);
  }

  const factor = 10 ** QTY_DECIMALS_G;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatQtyInput(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return String(Math.round(value));
  }

  return String(roundQty(value, unit));
}

function formatQtyLabel(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return `${Math.round(value)} ud`;
  }

  return `${roundQty(value, unit).toFixed(QTY_DECIMALS_G)} g`;
}

function formatCurrencyLabel(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parsePositiveNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getPricingEstimate(qty: number, price: number, discountPercent: number) {
  const originalAmount = roundCurrency(qty * price);
  const discountAmount = roundCurrency(originalAmount * (discountPercent / 100));
  const finalAmount = roundCurrency(originalAmount - discountAmount);

  return {
    originalAmount,
    discountAmount,
    finalAmount,
  };
}

function findClosestGramQty(rawQty: number, price: number, discountPercent: number, targetFinalAmount: number) {
  const rounded = roundQty(rawQty, "G");
  const candidates = [rounded - 0.001, rounded, rounded + 0.001]
    .filter((candidate) => candidate > 0)
    .map((candidate) => roundQty(candidate, "G"));

  let bestQty = candidates[0] ?? rounded;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateFinalAmount = getPricingEstimate(
      candidate,
      price,
      discountPercent
    ).finalAmount;
    const diff = Math.abs(candidateFinalAmount - targetFinalAmount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestQty = candidate;
    }
  }

  return bestQty;
}

export default function SalesPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [today, setToday] = useState<TodayTotals>(emptyToday);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentSalesDayClosed, setRecentSalesDayClosed] = useState(false);
  const [recentSalesError, setRecentSalesError] = useState("");
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberStatus, setMemberStatus] = useState<MemberOperationalStatus | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rfidInput, setRfidInput] = useState("");
  const [rfidError, setRfidError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedHashType, setSelectedHashType] = useState<"ALL" | ProductHashType>(
    "ALL"
  );
  const [focusedCartProductId, setFocusedCartProductId] = useState<number | null>(
    null
  );
  const [cancelingSaleId, setCancelingSaleId] = useState<number | null>(null);

  const rfidRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const cartInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const submittingRef = useRef(false);

  const loadRecentSales = useCallback(async () => {
    const data = await fetchJson<RecentSalesResponse>("/api/sales");
    setRecentSales(data.sales);
    setRecentSalesDayClosed(data.dayClosed);
    setRecentSalesError("");
  }, []);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (memberId) {
        productSearchRef.current?.focus();
        return;
      }

      rfidRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [memberId]);

  useEffect(() => {
    if (focusedCartProductId === null) return;

    const input = cartInputRefs.current.get(focusedCartProductId);
    if (!input) return;

    input.focus();
    input.select();
    setFocusedCartProductId(null);
  }, [cart, focusedCartProductId]);

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

  useEffect(() => {
    if (!memberId) return;

    let cancelled = false;

    void Promise.all([
      fetchJson<TodayTotals>(`/api/members/${memberId}/today`),
      fetchJson<MemberOperationalStatus>(
        `/api/members/${memberId}/operational-status`
      ),
    ])
      .then(([todayData, statusData]) => {
        if (!cancelled) {
          setToday(todayData);
          setMemberStatus(statusData);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error cargando socio");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const visibleToday = memberId ? today : emptyToday;

  const availableHashTypes = useMemo(() => {
    const present = new Set(
      products
        .filter((product) => product.active && product.category === "HASH")
        .map((product) => product.hashType)
        .filter((hashType): hashType is ProductHashType => Boolean(hashType))
    );

    return PRODUCT_HASH_TYPES.filter((hashType) => present.has(hashType.value));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => product.active)
      .filter((product) => {
        if (selectedCategory === "ALL") return true;
        return product.category === selectedCategory;
      })
      .filter((product) => {
        if (selectedHashType === "ALL") return true;
        return product.hashType === selectedHashType;
      })
      .filter((product) => {
        if (!query) return true;
        const categoryLabel = categoryLabelMap.get(product.category) ?? product.category;
        const hashTypeLabel = product.hashType
          ? hashTypeLabelMap.get(product.hashType) ?? product.hashType
          : "";
        const haystack = [
          product.sku ?? "",
          product.name,
          product.category,
          categoryLabel,
          product.hashType ?? "",
          hashTypeLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((left, right) => {
        if (!query) return 0;

        const leftExactSku = (left.sku ?? "").toLowerCase() === query;
        const rightExactSku = (right.sku ?? "").toLowerCase() === query;

        if (leftExactSku === rightExactSku) return 0;
        return leftExactSku ? -1 : 1;
      });
  }, [products, search, selectedCategory, selectedHashType]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();

    if (!q) return members;

    return members.filter((m) => {
      return (
        m.fullName.toLowerCase().includes(q) ||
        String(m.dni || "").toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch]);

  const cartLines = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const price = product ? Number(product.price) : 0;
      const stock = product ? Number(product.stock) : 0;
      const parsedQtyInput = parsePositiveNumber(item.qtyInput);
      const parsedAmountInput = parsePositiveNumber(item.amountInput);
      const discountPercent = normalizeDiscountPercent(
        Number(memberStatus?.member.discountPercent || 0)
      );
      let qty = 0;
      let originalAmount = 0;
      let discountAmount = 0;
      let finalAmount = 0;
      let conversionError = "";

      if (!product) {
        conversionError = "Producto no encontrado.";
      } else if (item.inputMode === "QTY") {
        if (parsedQtyInput === null) {
          conversionError = "Introduce una cantidad mayor que 0.";
        } else if (product.unit === "UD" && !Number.isInteger(parsedQtyInput)) {
          conversionError = "Este producto se vende por unidades enteras.";
        } else {
          qty = roundQty(parsedQtyInput, product.unit);

          if (qty <= 0) {
            conversionError = "La cantidad final debe ser mayor que 0.";
          } else {
            const pricing = getPricingEstimate(qty, price, discountPercent);
            originalAmount = pricing.originalAmount;
            discountAmount = pricing.discountAmount;
            finalAmount = pricing.finalAmount;
          }
        }
      } else if (parsedAmountInput === null) {
        conversionError = "Introduce un importe mayor que 0.";
      } else if (price <= 0) {
        conversionError = "El producto no tiene un precio valido.";
      } else if (discountPercent >= 100) {
        conversionError = "No se puede calcular por importe con descuento del 100 %.";
      } else if (product.unit === "UD") {
        const effectivePrice = price * (1 - discountPercent / 100);
        const rawQty = parsedAmountInput / effectivePrice;
        const roundedQty = Math.round(rawQty);

        if (Math.abs(rawQty - roundedQty) > QTY_EPSILON) {
          conversionError =
            "Este producto se vende por unidades. Introduce un importe que corresponda a unidades completas.";
        } else if (roundedQty <= 0) {
          conversionError = "La cantidad final debe ser mayor que 0.";
        } else {
          qty = roundedQty;
          const pricing = getPricingEstimate(qty, price, discountPercent);
          originalAmount = pricing.originalAmount;
          discountAmount = pricing.discountAmount;
          finalAmount = pricing.finalAmount;
        }
      } else {
        const effectivePrice = price * (1 - discountPercent / 100);
        const rawQty = parsedAmountInput / effectivePrice;
        qty = findClosestGramQty(rawQty, price, discountPercent, parsedAmountInput);

        if (qty <= 0) {
          conversionError = "La cantidad final debe ser mayor que 0.";
        } else {
          const pricing = getPricingEstimate(qty, price, discountPercent);
          originalAmount = pricing.originalAmount;
          discountAmount = pricing.discountAmount;
          finalAmount = pricing.finalAmount;
        }
      }

      return {
        ...item,
        product,
        price,
        stock,
        qty,
        originalAmount,
        discountPercent,
        discountAmount,
        finalAmount,
        conversionError,
      };
    });
  }, [cart, memberStatus, products]);

  const cartOriginalTotal = cartLines.reduce(
    (acc, line) => acc + line.originalAmount,
    0
  );
  const cartDiscountTotal = cartLines.reduce(
    (acc, line) => acc + line.discountAmount,
    0
  );
  const cartTotal = cartLines.reduce((acc, line) => acc + line.finalAmount, 0);

  const cartG = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "G") return acc + line.qty;
    return acc;
  }, 0);

  const cartUD = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "UD") return acc + line.qty;
    return acc;
  }, 0);

  const gramsAfter = visibleToday.grams + cartG;
  const unitsAfter = visibleToday.units + cartUD;
  const monthGramsAfter = visibleToday.monthlyGrams + cartG;
  const overGrams = gramsAfter > visibleToday.limits.dailyLimitG;
  const overUnits = unitsAfter > visibleToday.limits.dailyLimitUd;
  const overMonthly =
    visibleToday.limits.monthlyLimitG !== null &&
    monthGramsAfter > visibleToday.limits.monthlyLimitG;

  const stockProblems = cartLines.filter((line) => {
    if (!line.product) return true;
    return line.qty > line.stock;
  });

  const conversionProblems = cartLines.filter((line) => line.conversionError);

  const invalid =
    !memberId ||
    !memberStatus?.canWithdraw ||
    cart.length === 0 ||
    overGrams ||
    overUnits ||
    overMonthly ||
    conversionProblems.length > 0 ||
    stockProblems.length > 0 ||
    loading;

  function focusProductSearchInput() {
    window.setTimeout(() => {
      productSearchRef.current?.focus();
      productSearchRef.current?.select();
    }, 0);
  }

  function setCartValueInputRef(
    productId: number,
    node: HTMLInputElement | null
  ) {
    if (node) {
      cartInputRefs.current.set(productId, node);
      return;
    }

    cartInputRefs.current.delete(productId);
  }

  function addProduct(
    product: ProductSummary,
    options: AddProductOptions = {}
  ) {
    if (Number(product.stock) <= 0) return false;

    if (options.focusInput) {
      setFocusedCartProductId(product.id);
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) => {
          if (item.productId !== product.id) return item;

          if (item.inputMode === "QTY") {
            return {
              ...item,
              qtyInput: formatQtyInput(
                (parsePositiveNumber(existing.qtyInput) ?? 0) + 1,
                product.unit
              ),
            };
          }

          const discountPercent = normalizeDiscountPercent(
            Number(memberStatus?.member.discountPercent || 0)
          );
          const currentAmount = parsePositiveNumber(item.amountInput) ?? 0;
          const addedAmount = getPricingEstimate(
            1,
            Number(product.price),
            discountPercent
          ).finalAmount;

          return {
            ...item,
            amountInput: roundCurrency(currentAmount + addedAmount).toFixed(2),
          };
        });
      }

      return [
        ...prev,
        {
          productId: product.id,
          inputMode: "AMOUNT",
          qtyInput: "1",
          amountInput: "",
        },
      ];
    });

    return true;
  }

  function updateQty(productId: number, value: string) {
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, qtyInput: value } : item))
    );
  }

  function updateAmount(productId: number, value: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, amountInput: value } : item
      )
    );
  }

  function updateInputMode(productId: number, inputMode: CartInputMode) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        if (inputMode === "QTY") {
          const parsedAmount = parsePositiveNumber(item.amountInput);
          let nextQtyInput = item.qtyInput;
          const discountPercent = normalizeDiscountPercent(
            Number(memberStatus?.member.discountPercent || 0)
          );

          if (
            parsedAmount !== null &&
            Number(product.price) > 0 &&
            discountPercent < 100
          ) {
            const effectivePrice =
              Number(product.price) * (1 - discountPercent / 100);
            const nextQty =
              product.unit === "UD"
                ? Math.round(parsedAmount / effectivePrice)
                : findClosestGramQty(
                    parsedAmount / effectivePrice,
                    Number(product.price),
                    discountPercent,
                    parsedAmount
                  );

            if (nextQty > 0) {
              nextQtyInput = formatQtyInput(nextQty, product.unit);
            }
          }

          return {
            ...item,
            inputMode,
            qtyInput: nextQtyInput,
          };
        }

        const parsedQty = parsePositiveNumber(item.qtyInput);
        const discountPercent = normalizeDiscountPercent(
          Number(memberStatus?.member.discountPercent || 0)
        );
        return {
          ...item,
          inputMode,
          amountInput:
            item.amountInput ||
            (parsedQty !== null
              ? getPricingEstimate(
                  parsedQty,
                  Number(product.price),
                  discountPercent
                ).finalAmount.toFixed(2)
              : ""),
        };
      })
    );
  }

  function removeProduct(productId: number) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  function handleCategoryFilter(category: string) {
    setSelectedCategory(category);

    if (category !== "ALL" && category !== "HASH") {
      setSelectedHashType("ALL");
    }
  }

  function handleProductSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key !== "Enter") return;

    event.preventDefault();

    const query = event.currentTarget.value.trim().toLowerCase();
    if (!query) return;

    const exactSkuMatches = products.filter(
      (product) =>
        product.active && (product.sku ?? "").trim().toLowerCase() === query
    );

    if (
      exactSkuMatches.length === 1 &&
      Number(exactSkuMatches[0].stock) > 0 &&
      addProduct(exactSkuMatches[0], { focusInput: true })
    ) {
      setSearch("");
    }
  }

  function handleCartValueKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    focusProductSearchInput();
  }

  function handleRegisterButtonKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>
  ) {
    if (event.key !== "Enter" && event.key !== "NumpadEnter") return;

    event.preventDefault();
  }

  async function handleRegisterWithdrawal() {
    if (invalid || submittingRef.current) return;

    submittingRef.current = true;
    const selectedMemberId = memberId;

    const items = cartLines
      .filter((line) => !line.conversionError)
      .map((line) => ({
        productId: line.productId,
        qty: line.qty,
      }))
      .filter((item) => item.qty > 0);

    if (items.length !== cart.length) {
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

      setCart([]);

      const refreshedProducts = await fetchJson<ProductSummary[]>("/api/products");
      setProducts(refreshedProducts);

      const refreshedToday = await fetchJson<TodayTotals>(
        `/api/members/${selectedMemberId}/today`
      );
      setToday(refreshedToday);
      await loadRecentSales();

      setMemberId("");
      setMemberSearch("");
      setRfidInput("");
      setToday(emptyToday);
      setMemberStatus(null);

      setTimeout(() => {
        rfidRef.current?.focus();
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

    const reason = window.prompt(
      `Motivo para anular la retirada #${sale.id}`
    );

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

      if (memberId) {
        const refreshedToday = await fetchJson<TodayTotals>(
          `/api/members/${memberId}/today`
        );
        setToday(refreshedToday);
      }

      await loadRecentSales();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error anulando retirada");
    } finally {
      setCancelingSaleId(null);
    }
  }

  async function handleRfidSubmit(e: React.FormEvent) {
    e.preventDefault();

    const code = rfidInput.trim();
    if (!code) return;

    setRfidError("");

    const res = await fetch(`/api/members/by-rfid/${encodeURIComponent(code)}`);

    if (!res.ok) {
      setRfidError("Chapita no asignada");
      return;
    }

    const member = await res.json();

    setMemberId(String(member.id));
    setMemberSearch(member.fullName);
    setCart([]);
    setRfidInput("");

    focusProductSearchInput();
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">TPV de retiradas</h1>
          <p className="text-sm app-muted">
            Modo mostrador/tablet · carrito multi-producto
          </p>
        </div>

        <div className="app-panel rounded-2xl p-3 text-sm">
          Hoy: <strong>{visibleToday.grams.toFixed(2)} g</strong> / {visibleToday.limits.dailyLimitG} g
          {" · "}
          <strong>{visibleToday.units.toFixed(0)} ud</strong> / {visibleToday.limits.dailyLimitUd} ud
        </div>
      </div>

      {error && <EmptyState message={error} className="mb-4" />}

      <section className="app-panel mb-4 rounded-3xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Ultimas retiradas de hoy</h2>
            {recentSalesDayClosed ? (
              <div className="mt-1 text-xs text-amber-700">
                El dia esta cerrado; no se pueden anular retiradas.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              void loadRecentSales().catch((err) => {
                setRecentSalesError(
                  err instanceof Error ? err.message : "Error cargando retiradas"
                );
              });
            }}
            className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold"
          >
            Actualizar
          </button>
        </div>

        {recentSalesError ? (
          <div className="rounded-2xl bg-red-100 p-3 text-sm text-red-700">
            {recentSalesError}
          </div>
        ) : recentSales.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 p-4 text-sm text-gray-600">
            No hay retiradas registradas hoy.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recentSales.map((sale) => {
              const cancelled = Boolean(sale.cancelledAt);
              const amount = sale.finalAmount ?? sale.totalAmount;

              return (
                <div
                  key={sale.id}
                  className={`rounded-2xl border border-black/8 bg-white/82 p-3 ${
                    cancelled ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>#{sale.id}</span>
                        <span>{sale.product.name}</span>
                        {cancelled ? (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                            Anulada
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {sale.member.fullName} - {formatQtyLabel(
                          sale.qty,
                          sale.product.unit === "UD" ? "UD" : "G"
                        )} - {formatTimeLabel(sale.createdAt)}
                      </div>
                      {cancelled && sale.cancelReason ? (
                        <div className="mt-1 text-xs text-red-700">
                          Motivo: {sale.cancelReason}
                        </div>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-black ${
                          cancelled ? "text-gray-500 line-through" : ""
                        }`}
                      >
                        {formatCurrencyLabel(amount)}
                      </div>
                      {!cancelled ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleCancelRecentSale(sale);
                          }}
                          disabled={!sale.canCancel || cancelingSaleId !== null}
                          className="mt-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                        >
                          {cancelingSaleId === sale.id ? "Anulando..." : "Anular"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={handleRfidSubmit} className="app-panel mb-4 space-y-2 rounded-3xl p-4">
        <label className="block text-sm font-medium">Escanear chapita</label>

        <input
          className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
          placeholder="Pasa la chapita por el lector..."
          value={rfidInput}
          onChange={(e) => setRfidInput(e.target.value)}
          autoComplete="off"
          ref={rfidRef}
          autoFocus
        />

        {rfidError && (
            <div className="rounded-2xl bg-red-100 p-2 text-sm text-red-700">
            {rfidError}
          </div>
        )}
      </form>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.7fr)]">
        <section className="space-y-4">
          <div className="app-panel rounded-3xl p-4 space-y-3">
            <label className="block text-sm font-medium">Socio</label>

            <input
              className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
              placeholder="Buscar socio por nombre o DNI..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            <select
              className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
                setCart([]);
              }}
              required
            >
              <option value="">Selecciona socio</option>
              {filteredMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} {m.dni ? `· ${m.dni}` : ""}
                </option>
              ))}
            </select>

            {memberId && (
              <button
                type="button"
                onClick={() => {
                  setMemberId("");
                  setMemberSearch("");
                  setCart([]);
                  setToday(emptyToday);
                  setMemberStatus(null);
                  rfidRef.current?.focus();
                }}
                className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Cambiar socio
              </button>
            )}
          </div>

              {memberStatus && (
                <div className="app-panel rounded-3xl p-4 text-sm">
                  <div className="mb-2 font-semibold">Estado del socio</div>

                  <div className="flex flex-wrap gap-2">
                    {memberStatus.member.active ? (
                      <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Bloqueado
                      </span>
                    )}

                    {memberStatus.hasContract ? (
                      <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                        Contrato firmado
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Sin contrato
                      </span>
                    )}

                    {memberStatus.expired ? (
                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        Membresía caducada
                      </span>
                    ) : (
                      <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                        Membresía vigente
                      </span>
                    )}

                    <span className="rounded bg-gray-900 px-3 py-1 text-white">
                      {memberStatus.member.commercialProfile}
                    </span>

                    <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                      {Number(memberStatus.member.discountPercent || 0).toFixed(2)}%
                      descuento
                    </span>

                    {memberStatus.contract?.monthlyLimitG !== null ? (
                      <span className="rounded bg-amber-100 px-3 py-1 text-amber-800">
                        Mensual {memberStatus.contract?.monthlyLimitG} g
                      </span>
                    ) : null}
                  </div>

                  {!memberStatus.canWithdraw && (
                    <div className="mt-3 rounded bg-red-100 p-2 text-red-700">
                      Este socio no puede realizar retiradas.
                    </div>
                  )}
                </div>
              )}

          <div className="app-panel rounded-3xl p-4">
            <label className="mb-1 block text-sm font-medium">
              Buscar producto
            </label>
            <input
              className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
              placeholder="Buscar por código o nombre..."
              ref={productSearchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleProductSearchKeyDown}
              autoComplete="off"
            />
          </div>

          <div className="app-panel rounded-3xl p-4">
            <div className="mb-2 text-sm font-medium">Categorías rápidas</div>

            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => handleCategoryFilter(category.value)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    selectedCategory === category.value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {availableHashTypes.length > 0 ? (
            <div className="app-panel rounded-3xl p-4">
              <div className="mb-2 text-sm font-medium">Subtipos Hash</div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedHashType("ALL")}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    selectedHashType === "ALL"
                      ? "bg-blue-700 text-white"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  Todos
                </button>

                {availableHashTypes.map((hashType) => (
                  <button
                    key={hashType.value}
                    type="button"
                    onClick={() => {
                      if (selectedCategory !== "ALL" && selectedCategory !== "HASH") {
                        setSelectedCategory("HASH");
                      }

                      setSelectedHashType(hashType.value);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      selectedHashType === hashType.value
                        ? "bg-blue-700 text-white"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {hashType.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filteredProducts.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {filteredProducts.map((product) => {
                const noStock = Number(product.stock) <= 0;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product, { focusInput: true })}
                    disabled={noStock}
                    className={`min-h-36 rounded-xl border p-4 text-left shadow-sm transition hover:scale-[1.02] disabled:opacity-40 ${
                      noStock ? "bg-gray-100" : "bg-white hover:bg-blue-50"
                    }`}
                  >
                    <div className="text-lg font-black">
                      {product.sku ? `${product.sku} · ${product.name}` : product.name}
                    </div>

                    <div className="mt-1 text-xs font-bold text-gray-500">
                      {product.category}
                      {product.hashType
                        ? ` · ${hashTypeLabelMap.get(product.hashType) ?? product.hashType}`
                        : ""}
                    </div>

                    <div className="mt-2 text-2xl font-bold text-blue-700">
                      {Number(product.price).toFixed(2)} EUR
                    </div>

                    <div className="text-xs text-gray-500">
                      por {product.unit === "G" ? "gramo" : "unidad"}
                    </div>

                    <div className="mt-3 text-sm">
                      Stock:{" "}
                      <strong>
                        {Number(product.stock).toFixed(2)} {product.unit}
                      </strong>
                    </div>

                    <div className="mt-3 rounded bg-gray-900 px-3 py-2 text-center text-sm font-bold text-white">
                      {noStock ? "SIN STOCK" : "AÑADIR"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 p-6 text-center text-sm font-semibold text-gray-600">
              No hay productos con ese código o nombre.
            </div>
          )}
        </section>

        <aside className="app-panel-strong rounded-3xl p-4 xl:sticky xl:top-24 xl:self-start">
          <h2 className="mb-3 text-lg font-bold">Carrito</h2>

          {cartLines.length === 0 && (
            <EmptyState message="Añade productos para registrar una retirada." />
          )}

          <div className="space-y-3">
            {cartLines.map((line) => (
              <div key={line.productId} className="rounded-2xl border border-black/8 bg-white/82 p-3">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{line.product?.name}</div>
                    <div className="text-sm text-gray-500">
                      Stock: {line.stock.toFixed(2)} {line.product?.unit}
                    </div>
                    <div className="text-sm text-gray-500">
                      Precio unitario: {line.price.toFixed(2)} EUR /{" "}
                      {line.product?.unit === "G" ? "g" : "ud"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                        Producto agregado
                      </span>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                        Modo {line.inputMode === "AMOUNT" ? "Por importe" : "Por cantidad"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeProduct(line.productId)}
                    className="text-sm text-red-600"
                  >
                    Quitar
                  </button>
                </div>

                <div className="mt-3">
                  <label className="text-xs text-gray-500">Modo de entrada</label>
                  <select
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm font-medium"
                    value={line.inputMode}
                    onChange={(e) =>
                      updateInputMode(line.productId, e.target.value as CartInputMode)
                    }
                  >
                    <option value="AMOUNT">Por importe</option>
                    <option value="QTY">Por cantidad</option>
                  </select>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    {line.inputMode === "QTY" ? (
                      <>
                        <label className="text-xs text-gray-500">Cantidad</label>

                        <div className="mt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateQty(
                                line.productId,
                                formatQtyInput(
                                  Math.max(
                                    0,
                                    line.qty -
                                      (line.product?.unit === "UD" ? 1 : 0.001)
                                  ),
                                  line.product?.unit === "UD" ? "UD" : "G"
                                )
                              )
                            }
                            className="h-11 w-11 rounded bg-gray-200 text-xl font-bold"
                          >
                            -
                          </button>

                          <input
                            ref={(node) => setCartValueInputRef(line.productId, node)}
                            className="h-11 w-full rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold"
                            type="number"
                            step={line.product?.unit === "UD" ? "1" : "0.001"}
                            min="0"
                            value={line.qtyInput}
                            onChange={(e) => updateQty(line.productId, e.target.value)}
                            onKeyDown={handleCartValueKeyDown}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              updateQty(
                                line.productId,
                                formatQtyInput(
                                  line.qty +
                                    (line.product?.unit === "UD" ? 1 : 0.001),
                                  line.product?.unit === "UD" ? "UD" : "G"
                                )
                              )
                            }
                            className="h-11 w-11 rounded-2xl bg-gray-900 text-xl font-bold text-white"
                          >
                            +
                          </button>
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          Importe final estimado: {line.finalAmount.toFixed(2)} EUR
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="text-xs text-gray-500">Importe en euros</label>
                        <input
                          ref={(node) => setCartValueInputRef(line.productId, node)}
                          className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold"
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.amountInput}
                          onChange={(e) => updateAmount(line.productId, e.target.value)}
                          onKeyDown={handleCartValueKeyDown}
                        />

                        <div className="mt-2 text-xs text-gray-500">
                          Cantidad calculada: {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Cantidad final</label>
                      <div className="rounded-2xl border border-black/8 bg-gray-50 p-2">
                        {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">Importe final estimado</label>
                      <div className="rounded-2xl border border-black/8 bg-gray-50 p-2">
                        {line.finalAmount.toFixed(2)} EUR
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Importe base estimado: {line.originalAmount.toFixed(2)} EUR
                    </div>

                    {line.discountAmount > 0 && (
                      <div className="text-xs text-blue-700">
                        Descuento estimado: {line.discountAmount.toFixed(2)} EUR
                      </div>
                    )}
                  </div>
                </div>

                {line.conversionError && (
                  <div className="mt-2 rounded-2xl bg-red-100 p-2 text-sm text-red-700">
                    {line.conversionError}
                  </div>
                )}

                {line.qty > line.stock && (
                  <div className="mt-2 rounded-2xl bg-red-100 p-2 text-sm text-red-700">
                    Stock insuficiente.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-3xl bg-gray-900 p-4 text-white">
            <div className="text-sm opacity-80">Subtotal original</div>
            <div className="text-2xl font-bold">
              {cartOriginalTotal.toFixed(2)} EUR
            </div>
            <div className="mt-3 text-sm opacity-80">Descuento</div>
            <div className="text-2xl font-bold text-blue-200">
              -{cartDiscountTotal.toFixed(2)} EUR
            </div>
            <div className="mt-3 text-sm opacity-80">Total retirada</div>
            <div className="text-5xl font-black">{cartTotal.toFixed(2)} EUR</div>
          </div>

          <div className="mt-3 rounded-2xl border border-black/8 bg-white/80 p-3 text-sm">
            Con carrito:{" "}
            <strong className={overGrams ? "text-red-600" : "text-green-700"}>
              {gramsAfter.toFixed(2)} g
            </strong>
            {" · "}
            <strong className={overUnits ? "text-red-600" : "text-green-700"}>
              {unitsAfter.toFixed(0)} ud
            </strong>
            {visibleToday.limits.monthlyLimitG !== null ? (
              <>
                {" / "}
                <strong className={overMonthly ? "text-red-600" : "text-green-700"}>
                  {monthGramsAfter.toFixed(2)} / {visibleToday.limits.monthlyLimitG} g mes
                </strong>
              </>
            ) : null}
          </div>

          {overGrams && (
            <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
              Se supera el límite diario de {visibleToday.limits.dailyLimitG} g.
            </div>
          )}

          {overUnits && (
            <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
              Se supera el límite diario de {visibleToday.limits.dailyLimitUd} ud.
            </div>
          )}

          {overMonthly && visibleToday.limits.monthlyLimitG !== null && (
            <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
              Se supera el límite mensual de {visibleToday.limits.monthlyLimitG} g.
            </div>
          )}

          {stockProblems.length > 0 && (
            <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
              Hay productos sin stock suficiente.
            </div>
          )}

          {conversionProblems.length > 0 && (
            <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
              Hay lineas con errores de conversion. Corrigelas antes de registrar.
            </div>
          )}

          <button
            type="button"
            onClick={handleRegisterWithdrawal}
            onKeyDown={handleRegisterButtonKeyDown}
            disabled={invalid || loading}
            className="app-button-primary mt-4 w-full rounded-3xl p-6 text-2xl font-black shadow-lg disabled:opacity-40"
          >
            {loading ? "Registrando..." : "COBRAR / REGISTRAR"}
          </button>
        </aside>
      </div>
    </main>
  );
}
