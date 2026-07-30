"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import {
  buildCashMoveGroups,
  getCashReportHref,
  getCountedCashValue,
  getDraftCashDifference,
  SIGNIFICANT_CASH_DIFFERENCE_EUR,
} from "@/lib/helpers/cash-formatters";
import type {
  AccessCurrentResponse,
  CashMove,
  DashboardClosureStatus,
  DayClosure,
  DayClosureSummary,
} from "@/lib/types";

type ClosureResponse = {
  closed: boolean;
  status: DashboardClosureStatus;
  closure: DayClosure | null;
  summary: DayClosureSummary;
};

export function useCashPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [moves, setMoves] = useState<CashMove[]>([]);
  const [closure, setClosure] = useState<DayClosure | null>(null);
  const [summary, setSummary] = useState<DayClosureSummary | null>(null);
  const [dayStatus, setDayStatus] =
    useState<DashboardClosureStatus>("PENDING");
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [inventoryCountId, setInventoryCountId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [accessStatus, setAccessStatus] = useState<AccessCurrentResponse>({
    count: 0,
    inside: [],
  });
  const [autoCheckoutMessage, setAutoCheckoutMessage] = useState("");

  const loadCash = useCallback(async () => {
    setError("");

    const [movesRes, closureRes, accessRes] = await Promise.all([
      fetch("/api/cash"),
      fetch("/api/day-closure"),
      fetch("/api/access/current"),
    ]);

    if (!movesRes.ok || !closureRes.ok || !accessRes.ok) {
      const closureError = (await closureRes.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(closureError?.error || "Error cargando caja");
    }

    const movesData: CashMove[] = await movesRes.json();
    const closureData: ClosureResponse = await closureRes.json();
    const accessData: AccessCurrentResponse = await accessRes.json();

    setMoves(movesData);
    setDayStatus(closureData.status);
    setClosure(closureData.closure);
    setSummary(closureData.summary);
    setAccessStatus(accessData);
    setInventoryCountId(
      closureData.closure?.inventoryCountId
        ? String(closureData.closure.inventoryCountId)
        : ""
    );
    setOpeningCash(
      closureData.closure
        ? String(Number(closureData.closure.openingCash || 0))
        : "0"
    );
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCash().catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : "Error cargando caja"
        );
      });
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCash]);

  const { todayMoves, groupedMoves, orderedGroups } =
    buildCashMoveGroups(moves);
  const isClosed = dayStatus === "CLOSED";
  const isReopened = dayStatus === "REOPENED";
  const canPrepareClosure = dayStatus === "OPEN" || isReopened;
  const liveExpectedCash = Number(summary?.expectedCash || 0);
  const expectedCash = isClosed
    ? Number(closure?.expectedCash ?? liveExpectedCash)
    : liveExpectedCash;
  const countedValue = getCountedCashValue(countedCash);
  const draftDifference = getDraftCashDifference(
    countedValue,
    liveExpectedCash
  );
  const inventoryOptions = summary?.inventoryCounts ?? [];
  const inventoryCountsOpenCount = summary?.inventoryCountsOpenCount || 0;
  const noteRequired =
    canPrepareClosure &&
    (Math.abs(draftDifference) >= SIGNIFICANT_CASH_DIFFERENCE_EUR ||
      isReopened);
  const reportDay = summary?.day ?? closure?.day;
  const csvHref = getCashReportHref(reportDay);
  const responsibleLabel =
    session?.user?.name || session?.user?.email || "Sesion actual";

  async function openDay() {
    const openingValue = openingCash.trim() ? Number(openingCash) : 0;

    if (!Number.isFinite(openingValue) || openingValue < 0) {
      setError("La caja inicial debe ser un numero valido mayor o igual a cero");
      return;
    }

    setSaving(true);
    setError("");

    try {
      setAutoCheckoutMessage("");
      const res = await fetch("/api/day-closure/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          openingCash: openingValue,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error || "Error al abrir el dia");
      }

      await loadCash();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Error al abrir");
    } finally {
      setSaving(false);
    }
  }

  async function closeDay() {
    if (!summary || !canPrepareClosure) {
      return;
    }

    if (!countedCash.trim()) {
      setError("La caja contada es obligatoria");
      return;
    }

    if (!Number.isFinite(Number(countedCash))) {
      setError("La caja contada debe ser un numero valido");
      return;
    }

    if (noteRequired && !note.trim()) {
      setError(
        "La nota de cierre es obligatoria por diferencia de caja o reapertura"
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      setAutoCheckoutMessage("");
      const res = await fetch("/api/day-closure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          countedCash: Number(countedCash),
          note,
          inventoryCountId: inventoryCountId ? Number(inventoryCountId) : null,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error || "Error al cerrar el dia");
      }

      setCountedCash("");
      setNote("");
      setReopenReason("");
      await loadCash();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Error al cerrar");
    } finally {
      setSaving(false);
    }
  }

  async function reopenDay() {
    if (!reopenReason.trim()) {
      setError("El motivo de reapertura es obligatorio");
      return;
    }

    setSaving(true);
    setError("");

    try {
      setAutoCheckoutMessage("");
      const res = await fetch("/api/day-closure/reopen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reopenReason,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error || "Error al reabrir el dia");
      }

      setReopenReason("");
      await loadCash();
    } catch (reopenError) {
      setError(
        reopenError instanceof Error ? reopenError.message : "Error al reabrir"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoCheckout() {
    if (saving || accessStatus.count === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Hay ${accessStatus.count} socios dentro. Se registrara salida automatica para todos.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    setAutoCheckoutMessage("");

    try {
      const res = await fetch("/api/access/auto-checkout", {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; count?: number }
        | null;

      if (!res.ok) {
        throw new Error(data?.error || "Error al registrar salida automatica");
      }

      setAutoCheckoutMessage(
        `Se registro la salida automatica de ${Number(data?.count || 0)} socio(s).`
      );
      await loadCash();
    } catch (autoCheckoutError) {
      setError(
        autoCheckoutError instanceof Error
          ? autoCheckoutError.message
          : "Error al registrar salida automatica"
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    accessStatus,
    autoCheckoutMessage,
    canPrepareClosure,
    closure,
    countedCash,
    countedValue,
    csvHref,
    dayStatus,
    draftDifference,
    error,
    expectedCash,
    groupedMoves,
    inventoryCountId,
    inventoryCountsOpenCount,
    inventoryOptions,
    isAdmin,
    isClosed,
    isReopened,
    note,
    noteRequired,
    openingCash,
    orderedGroups,
    reopenReason,
    responsibleLabel,
    saving,
    setCountedCash,
    setInventoryCountId,
    setNote,
    setOpeningCash,
    setReopenReason,
    summary,
    todayMoves,
    closeDay,
    handleAutoCheckout,
    openDay,
    reopenDay,
  };
}
