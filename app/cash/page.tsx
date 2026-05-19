"use client";

import { normalizeCashMoveSource } from "@/lib/cash-move";
import { CASH_MOVE_SOURCES } from "@/lib/cash-move";
import type {
  CashMove,
  DayClosure,
  DayClosureInventoryOption,
  DayClosureSummary,
} from "@/lib/types";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type ClosureResponse = {
  closed: boolean;
  closure: DayClosure | null;
  summary: DayClosureSummary;
};

function formatCurrency(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatSourceLabel(source: CashMove["source"]) {
  switch (normalizeCashMoveSource(source)) {
    case "SALE":
      return "Ventas";
    case "EXPENSE":
      return "Gastos";
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

  return `#${count.id} ${count.type} · ${count.status} · ${timestamp}`;
}

export default function CashPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [moves, setMoves] = useState<CashMove[]>([]);
  const [closure, setClosure] = useState<DayClosure | null>(null);
  const [summary, setSummary] = useState<DayClosureSummary | null>(null);
  const [closed, setClosed] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [inventoryCountId, setInventoryCountId] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadCash() {
    setError("");

    const [movesRes, closureRes] = await Promise.all([
      fetch("/api/cash"),
      fetch("/api/day-closure"),
    ]);

    if (!movesRes.ok || !closureRes.ok) {
      const closureError = (await closureRes.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(closureError?.error || "Error cargando caja");
    }

    const movesData: CashMove[] = await movesRes.json();
    const closureData: ClosureResponse = await closureRes.json();

    setMoves(movesData);
    setClosed(closureData.closed);
    setClosure(closureData.closure);
    setSummary(closureData.summary);
    setInventoryCountId(
      closureData.closure?.inventoryCountId
        ? String(closureData.closure.inventoryCountId)
        : ""
    );
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCash().catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Error cargando caja");
      });
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const todayMoves = moves.filter((move) => {
    const date = new Date(move.createdAt);
    const now = new Date();

    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  });
  const groupedMoves = todayMoves.reduce<Record<string, CashMove[]>>((acc, move) => {
    const key = normalizeCashMoveSource(move.source, {
      type: move.type,
      note: move.note,
    });
    acc[key] = acc[key] ? [...acc[key], move] : [move];
    return acc;
  }, {});
  const orderedGroups = [
    ...CASH_MOVE_SOURCES.filter((source) => groupedMoves[source]?.length),
    ...Object.keys(groupedMoves).filter((source) => !CASH_MOVE_SOURCES.includes(source as (typeof CASH_MOVE_SOURCES)[number])),
  ];

  const closureValues = closure ?? summary;
  const expectedCash = Number(closureValues?.expectedCash || 0);
  const countedValue = Number(countedCash || 0);
  const draftDifference = countedValue - expectedCash;
  const inventoryOptions = summary?.inventoryCounts ?? [];
  const hasOpenInventoryCounts = (summary?.inventoryCountsOpenCount || 0) > 0;

  async function closeDay() {
    if (!summary) {
      return;
    }

    if (!countedCash.trim()) {
      setError("La caja contada es obligatoria");
      return;
    }

    setSaving(true);
    setError("");

    try {
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
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
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
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
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

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Caja</h1>
        <p className="mt-2 text-sm app-muted">
          Cierre diario profesional con trazabilidad de ventas, gastos y soporte
          para conteos de inventario.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {hasOpenInventoryCounts ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hay {summary?.inventoryCountsOpenCount} conteo(s) OPEN de hoy. Puedes
          vincular uno al cierre, pero conviene revisarlos antes de cerrar caja.
        </div>
      ) : null}

      {closure?.reopenedAt && !closed ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          El cierre de hoy fue reabierto el{" "}
          {new Date(closure.reopenedAt).toLocaleString()}.
          {closure.reopenReason ? ` Motivo: ${closure.reopenReason}` : ""}
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Ventas</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.salesTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {summary?.salesCount || 0} ventas hoy
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Gastos</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.expensesTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {summary?.cashMovesCount || 0} movimientos de caja
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Movimientos manuales</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.manualCashTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Ajuste neto fuera de ventas y gastos registrados
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Descuentos</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(summary?.discountsTotal || 0))}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Impacto aplicado en ventas del dia
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Caja esperada</div>
          <div className="mt-1 text-2xl font-black">
            {formatCurrency(Number(closureValues?.expectedCash || 0))}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Caja contada</div>
          <div className="mt-1 text-2xl font-black">
            {closed
              ? formatCurrency(Number(closure?.countedCash || 0))
              : formatCurrency(countedValue)}
          </div>
        </div>

        <div className="app-panel rounded-3xl p-4">
          <div className="text-sm text-gray-500">Diferencia</div>
          <div
            className={`mt-1 text-2xl font-black ${
              Number(closed ? closure?.difference : draftDifference) === 0
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            {closed
              ? formatCurrency(Number(closure?.difference || 0))
              : formatCurrency(draftDifference)}
          </div>
        </div>
      </div>

      {closed ? (
        <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Cierre del dia completado</h2>
              <p className="mt-1 text-sm text-gray-500">
                Dia {closure?.day} · creado el{" "}
                {closure?.createdAt
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
                Ventas
              </div>
              <strong>{formatCurrency(Number(closure?.salesTotal || 0))}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Gastos
              </div>
              <strong>{formatCurrency(Number(closure?.expensesTotal || 0))}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Mov. manuales
              </div>
              <strong>{formatCurrency(Number(closure?.manualCashTotal || 0))}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Descuentos
              </div>
              <strong>{formatCurrency(Number(closure?.discountsTotal || 0))}</strong>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
      ) : (
        <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
          <h2 className="text-xl font-black">Preparar cierre del dia</h2>
          <p className="mt-1 text-sm text-gray-500">
            El servidor recalculara ventas, gastos, movimientos manuales,
            descuentos y caja esperada antes de guardar el cierre.
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
            placeholder="Nota de cierre"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!isAdmin || saving}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
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
                Solo ADMIN puede cerrar el dia.
              </div>
            )}
          </div>
        </div>
      )}

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
                    {move.createdByUser?.name ? ` · ${move.createdByUser.name}` : ""}
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
