"use client";

import {
  CASH_MOVE_SOURCES,
  normalizeCashMoveSource,
} from "@/lib/cash-move";
import type {
  AccessCurrentResponse,
  CashMove,
  DashboardClosureStatus,
  DayClosure,
  DayClosureInventoryOption,
  DayClosureSummary,
} from "@/lib/types";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type ClosureResponse = {
  closed: boolean;
  status: DashboardClosureStatus;
  closure: DayClosure | null;
  summary: DayClosureSummary;
};

const SIGNIFICANT_CASH_DIFFERENCE_EUR = 1;

function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatQty(value: number, unit: string) {
  return `${Number(value || 0).toFixed(2)} ${unit}`;
}

function formatClosureStatus(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "Dia abierto";
    case "CLOSED":
      return "Cierre realizado";
    case "REOPENED":
      return "Dia reabierto";
    default:
      return "Apertura pendiente";
  }
}

function closureStatusClassName(status: DashboardClosureStatus) {
  switch (status) {
    case "CLOSED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "REOPENED":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "OPEN":
      return "border-blue-200 bg-blue-50 text-blue-900";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

function closureStatusMessage(status: DashboardClosureStatus) {
  switch (status) {
    case "OPEN":
      return "El turno esta abierto. El cierre queda pendiente para el final del dia.";
    case "CLOSED":
      return "El cierre diario ya esta guardado y bloquea nuevas retiradas del dia.";
    case "REOPENED":
      return "El cierre fue reabierto. Revisa la diferencia y deja nota al volver a cerrar.";
    default:
      return "Registra la apertura con caja inicial antes de cerrar el dia.";
  }
}

function formatSourceLabel(source: CashMove["source"]) {
  switch (normalizeCashMoveSource(source)) {
    case "SALE":
      return "Ventas";
    case "SALE_CANCELLED":
      return "Ventas anuladas";
    case "EXPENSE":
      return "Gastos";
    case "EXPENSE_CANCELLED":
      return "Gastos anulados";
    case "PURCHASE_PAYMENT":
      return "Pagos de compras";
    case "MANUAL":
      return "Manuales";
    case "ADJUSTMENT":
      return "Ajustes";
    default:
      return "Otros";
  }
}

function formatPaymentMethodLabel(paymentMethod: CashMove["paymentMethod"]) {
  switch ((paymentMethod || "CASH").toUpperCase()) {
    case "CARD":
      return "Tarjeta";
    case "TRANSFER":
      return "Transferencia";
    case "OTHER":
      return "Otro";
    default:
      return "Efectivo";
  }
}

function formatInventoryLabel(count: DayClosureInventoryOption) {
  const timestamp = new Date(
    count.confirmedAt ?? count.createdAt
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const status =
    count.status === "OPEN"
      ? "Abierto"
      : count.status === "CONFIRMED"
        ? "Confirmado"
        : count.status === "CANCELLED"
          ? "Cancelado"
          : count.status;

  return `#${count.id} ${count.type} - ${status} - ${timestamp} - ${count.countedItems}/${count.totalItems} lineas`;
}

export default function CashPage() {
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

  const todayMoves = moves.filter((move) => {
    const date = new Date(move.createdAt);
    const now = new Date();

    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  });
  const groupedMoves = todayMoves.reduce<Record<string, CashMove[]>>(
    (acc, move) => {
      const key = normalizeCashMoveSource(move.source, {
        type: move.type,
        note: move.note,
      });
      acc[key] = acc[key] ? [...acc[key], move] : [move];
      return acc;
    },
    {}
  );
  const orderedGroups = [
    ...CASH_MOVE_SOURCES.filter((source) => groupedMoves[source]?.length),
    ...Object.keys(groupedMoves).filter(
      (source) =>
        !CASH_MOVE_SOURCES.includes(
          source as (typeof CASH_MOVE_SOURCES)[number]
        )
    ),
  ];

  const isClosed = dayStatus === "CLOSED";
  const isReopened = dayStatus === "REOPENED";
  const canPrepareClosure = dayStatus === "OPEN" || isReopened;
  const liveExpectedCash = Number(summary?.expectedCash || 0);
  const expectedCash = isClosed
    ? Number(closure?.expectedCash ?? liveExpectedCash)
    : liveExpectedCash;
  const countedNumber = Number(countedCash);
  const countedValue = Number.isFinite(countedNumber) ? countedNumber : 0;
  const draftDifference = Number((countedValue - liveExpectedCash).toFixed(2));
  const inventoryOptions = summary?.inventoryCounts ?? [];
  const hasOpenInventoryCounts = (summary?.inventoryCountsOpenCount || 0) > 0;
  const noteRequired =
    canPrepareClosure &&
    (Math.abs(draftDifference) >= SIGNIFICANT_CASH_DIFFERENCE_EUR ||
      isReopened);
  const reportDay = summary?.day ?? closure?.day;
  const csvHref = reportDay
    ? `/api/day-closure/report?day=${encodeURIComponent(reportDay)}&format=csv`
    : "/api/day-closure/report?format=csv";

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

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Caja</h1>
        <p className="mt-2 text-sm app-muted">
          Apertura de turno, cierre diario guiado y reporte operativo.
        </p>
      </div>

      <div
        className={`mb-4 rounded-2xl border p-4 text-sm ${closureStatusClassName(
          dayStatus
        )}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-black">{formatClosureStatus(dayStatus)}</div>
            <div className="mt-1">{closureStatusMessage(dayStatus)}</div>
            {closure?.openedAt ? (
              <div className="mt-1 text-xs">
                Apertura: {new Date(closure.openedAt).toLocaleString()}
                {closure.openedByUser?.name
                  ? ` - ${closure.openedByUser.name}`
                  : ""}
              </div>
            ) : null}
          </div>
          <a
            className="rounded-full border border-current/15 px-4 py-2 text-xs font-bold"
            href={csvHref}
          >
            Exportar CSV
          </a>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {autoCheckoutMessage ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {autoCheckoutMessage}
        </div>
      ) : null}

      {hasOpenInventoryCounts ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hay {summary?.inventoryCountsOpenCount} conteo(s) abiertos hoy.
          Revisa los conteos abiertos antes de cerrar o vincula el conteo
          confirmado correspondiente.
        </div>
      ) : null}

      {accessStatus.count > 0 ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div>
            Quedan {accessStatus.count} socio(s) dentro. Puedes marcar salida
            automatica antes de cerrar.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAutoCheckout()}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-60"
              disabled={saving}
            >
              Marcar salida de todos
            </button>
          </div>
        </div>
      ) : null}

      {isReopened && closure?.reopenedAt ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El cierre de hoy fue reabierto el{" "}
          {new Date(closure.reopenedAt).toLocaleString()}.
          {closure.reopenReason ? ` Motivo: ${closure.reopenReason}` : ""}
        </div>
      ) : null}

      {dayStatus === "PENDING" ? (
        <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
          <h2 className="text-xl font-black">Abrir turno/dia</h2>
          <p className="mt-1 text-sm text-gray-500">
            Registra la caja inicial para dejar el dia abierto y preparar el
            cierre con una base clara.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-semibold text-gray-700">
              Caja inicial
              <input
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                disabled={!isAdmin || saving}
              />
            </label>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => void openDay()}
                className="app-button-primary rounded-2xl px-5 py-3 font-bold text-white disabled:opacity-60"
                disabled={saving}
              >
                Abrir dia
              </button>
            ) : (
              <div className="text-sm text-gray-500">
                Solo el administrador puede abrir el dia.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Caja inicial</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.openingCash || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Base registrada en apertura
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Ventas</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.salesTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {summary?.salesCount || 0} tickets hoy
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Gastos efectivo</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.expensesTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Gastos pagados en caja
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Ingresos caja</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.totalIncome || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {summary?.cashMovesCount || 0} movimientos
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Mov. manuales</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.manualCashTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Ajuste neto no automatico
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Descuentos</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.discountsTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Impacto aplicado en ventas
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Caja esperada</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(expectedCash)}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Caja contada</div>
          <div className="mt-1 text-2xl font-black">
            {isClosed
              ? formatCurrency(Number(closure?.countedCash || 0))
              : formatCurrency(countedValue)}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Diferencia</div>
          <div
            className={`mt-1 text-2xl font-black ${
              Number(isClosed ? closure?.difference : draftDifference) === 0
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            {isClosed
              ? formatCurrency(Number(closure?.difference || 0))
              : formatCurrency(draftDifference)}
          </div>
        </div>
      </div>

      {isClosed ? (
        <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Cierre diario completado</h2>
              <p className="mt-1 text-sm text-gray-500">
                Dia {closure?.day} - cerrado el{" "}
                {closure?.closedAt
                  ? new Date(closure.closedAt).toLocaleString()
                  : closure?.createdAt
                    ? new Date(closure.createdAt).toLocaleString()
                    : "-"}
              </p>
            </div>
            <div className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
              Dia cerrado
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Caja inicial
              </div>
              <strong>{formatCurrency(Number(closure?.openingCash || 0))}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Ventas
              </div>
              <strong>{formatCurrency(Number(closure?.salesTotal || 0))}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Gastos
              </div>
              <strong>
                {formatCurrency(Number(closure?.expensesTotal || 0))}
              </strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Descuentos
              </div>
              <strong>
                {formatCurrency(Number(closure?.discountsTotal || 0))}
              </strong>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
              <div className="text-sm text-gray-500">Responsable cierre</div>
              <div className="mt-1">
                {closure?.closedByUser?.name ||
                  closure?.closedByUser?.email ||
                  "Sin responsable"}
              </div>
            </div>
            <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
              <div className="text-sm text-gray-500">Nota</div>
              <div className="mt-1">{closure?.note || "Sin nota"}</div>
            </div>
            <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
              <div className="text-sm text-gray-500">Conteo vinculado</div>
              <div className="mt-1">
                {closure?.inventoryCountId
                  ? `Conteo #${closure.inventoryCountId}`
                  : "Sin conteo vinculado"}
              </div>
            </div>
          </div>

          {isAdmin ? (
            <div className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-4">
              <div className="mb-2 font-semibold">Reabrir dia</div>
              <textarea
                className="mb-3 min-h-24 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                placeholder="Motivo obligatorio de reapertura"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                disabled={saving}
              />
              <button
                type="button"
                onClick={() => void reopenDay()}
                className="rounded-2xl bg-amber-500 px-4 py-3 font-bold text-white disabled:opacity-60"
                disabled={saving}
              >
                Reabrir dia
              </button>
            </div>
          ) : null}
        </div>
      ) : canPrepareClosure ? (
        <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
          <h2 className="text-xl font-black">Preparar cierre del dia</h2>
          <p className="mt-1 text-sm text-gray-500">
            El servidor recalculara ventas, gastos, ingresos, descuentos y caja
            esperada antes de guardar el cierre.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              className="rounded-2xl border border-black/10 bg-white/80 p-3"
              type="number"
              step="0.01"
              required
              placeholder="Caja contada"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              disabled={!isAdmin || saving}
            />

            <select
              className="rounded-2xl border border-black/10 bg-white/80 p-3"
              value={inventoryCountId}
              onChange={(e) => setInventoryCountId(e.target.value)}
              disabled={!isAdmin || saving || inventoryOptions.length === 0}
            >
              <option value="">Sin conteo de inventario vinculado</option>
              {inventoryOptions.map((count) => (
                <option key={count.id} value={count.id}>
                  {formatInventoryLabel(count)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className="mt-3 min-h-24 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder={
              noteRequired
                ? "Nota obligatoria por diferencia o reapertura"
                : "Nota de cierre"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!isAdmin || saving}
          />

          {noteRequired ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Diferencia detectada o dia reabierto: deja una nota antes de
              cerrar.
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
            <div>
              <div className="text-sm text-gray-500">Responsable</div>
              <div className="font-black">
                {session?.user?.name || session?.user?.email || "Sesion actual"}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Caja esperada</div>
              <div className="text-xl font-black">
                {formatCurrency(Number(summary?.expectedCash || 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Diferencia prevista</div>
              <div
                className={`text-xl font-black ${
                  draftDifference === 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {formatCurrency(draftDifference)}
              </div>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void closeDay()}
                className="app-button-danger rounded-2xl px-5 py-3 font-bold text-white disabled:opacity-60"
                disabled={saving}
              >
                Cerrar dia
              </button>
            ) : (
              <div className="text-sm text-gray-500">
                Solo el administrador puede cerrar el dia.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <section className="app-panel mb-6 rounded-3xl p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Productos mas retirados</h2>
            <p className="mt-1 text-sm text-gray-500">
              Resumen diario por cantidad retirada.
            </p>
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
            {summary?.productsMostWithdrawn.length || 0} productos
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summary?.productsMostWithdrawn.length ? (
            summary.productsMostWithdrawn.map((product) => (
              <div
                key={product.productId}
                className="rounded-2xl border border-black/8 bg-white/70 p-4"
              >
                <div className="font-semibold">{product.name}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {product.salesCount} ticket(s)
                </div>
                <div className="mt-3 text-xl font-black">
                  {formatQty(product.qty, product.unit)}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {formatCurrency(product.revenue)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">
              No hay retiradas registradas hoy.
            </div>
          )}
        </div>
      </section>

      <h2 className="mb-2 font-semibold">Movimientos de hoy</h2>

      <div className="space-y-4">
        {orderedGroups.map((source) => {
          const sourceMoves = groupedMoves[source];

          if (!sourceMoves?.length) {
            return null;
          }

          return (
            <section key={source} className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">
                {formatSourceLabel(source)}
              </div>

              {sourceMoves.map((move) => (
                <div
                  key={move.id}
                  className="app-panel flex flex-col gap-3 rounded-3xl p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm text-gray-600">
                      {new Date(move.createdAt).toLocaleString()}
                    </div>
                    <div>{move.note || "Sin nota"}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatPaymentMethodLabel(move.paymentMethod)}
                      {move.createdByUser?.name
                        ? ` - ${move.createdByUser.name}`
                        : ""}
                    </div>
                  </div>

                  <div
                    className={
                      move.type === "income" ? "text-green-600" : "text-red-600"
                    }
                  >
                    {move.type === "income" ? "+" : "-"}
                    {formatCurrency(Number(move.amount))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        {todayMoves.length === 0 ? (
          <div className="app-panel rounded-3xl p-4 text-sm text-gray-500">
            No hay movimientos de caja hoy.
          </div>
        ) : null}
      </div>
    </main>
  );
}
