"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { useSalesCart } from "@/hooks/use-sales-cart";
import { useSalesMember } from "@/hooks/use-sales-member";
import { useSalesProducts } from "@/hooks/use-sales-products";
import { fetchJson } from "@/lib/fetch-json";
import { getSalesCartTotals } from "@/lib/helpers/sales-cart";
import type {
  RecentSale,
  RecentSalesResponse,
  TodayTotals,
} from "@/lib/helpers/sales-cart";
import type { MemberSummary, ProductSummary } from "@/lib/types";

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

  async function handleRfidSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = rfidInput.trim();
    if (!code) return;

    setRfidError("");

    const res = await fetch(`/api/members/by-rfid/${encodeURIComponent(code)}`);

    if (!res.ok) {
      setRfidError("Chapita no asignada");
      return;
    }

    const selectedMember = (await res.json()) as MemberSummary;

    member.setMemberId(String(selectedMember.id));
    member.setMemberSearch(selectedMember.fullName);
    cart.clearCart();
    setRfidInput("");

    focusProductSearchInput();
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
    handleRfidSubmit,
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
