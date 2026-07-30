import {
  formatCurrency,
  formatDateTime,
} from "@/lib/helpers/cash-formatters";
import type { DayClosure } from "@/lib/types";

export function CashReopenDialog({
  closure,
  isAdmin,
  saving,
  reopenReason,
  onReopenReasonChange,
  onReopenDay,
}: {
  closure: DayClosure | null;
  isAdmin: boolean;
  saving: boolean;
  reopenReason: string;
  onReopenReasonChange: (value: string) => void;
  onReopenDay: () => void;
}) {
  return (
    <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Cierre diario completado</h2>
          <p className="mt-1 text-sm text-gray-500">
            Dia {closure?.day} - cerrado el{" "}
            {closure?.closedAt
              ? formatDateTime(closure.closedAt)
              : closure?.createdAt
                ? formatDateTime(closure.createdAt)
                : "-"}
          </p>
        </div>
        <div className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">
          Dia cerrado
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ClosureMetric
          label="Caja inicial"
          value={formatCurrency(Number(closure?.openingCash || 0))}
        />
        <ClosureMetric
          label="Ventas"
          value={formatCurrency(Number(closure?.salesTotal || 0))}
        />
        <ClosureMetric
          label="Gastos"
          value={formatCurrency(Number(closure?.expensesTotal || 0))}
        />
        <ClosureMetric
          label="Descuentos"
          value={formatCurrency(Number(closure?.discountsTotal || 0))}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ClosureDetail
          label="Responsable cierre"
          value={
            closure?.closedByUser?.name ||
            closure?.closedByUser?.email ||
            "Sin responsable"
          }
        />
        <ClosureDetail label="Nota" value={closure?.note || "Sin nota"} />
        <ClosureDetail
          label="Conteo vinculado"
          value={
            closure?.inventoryCountId
              ? `Conteo #${closure.inventoryCountId}`
              : "Sin conteo vinculado"
          }
        />
      </div>

      {isAdmin ? (
        <div className="mt-4 rounded-2xl border border-black/8 bg-white/70 p-4">
          <div className="mb-2 font-semibold">Reabrir dia</div>
          <textarea
            className="mb-3 min-h-24 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Motivo obligatorio de reapertura"
            value={reopenReason}
            onChange={(e) => onReopenReasonChange(e.target.value)}
            disabled={saving}
          />
          <button
            type="button"
            onClick={onReopenDay}
            className="rounded-2xl bg-amber-500 px-4 py-3 font-bold text-white disabled:opacity-60"
            disabled={saving}
          >
            Reabrir dia
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ClosureMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
        {label}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function ClosureDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white/70 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
