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
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-emerald-500" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-emerald-700">
                Cierre completado
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Jornada cerrada
            </h2>

            <p className="mt-1 text-sm app-muted">
              Día {closure?.day} ·{" "}
              {closure?.closedAt
                ? formatDateTime(closure.closedAt)
                : closure?.createdAt
                  ? formatDateTime(closure.createdAt)
                  : "Sin fecha"}
            </p>
          </div>

          <span className="app-badge app-badge-positive rounded-full px-4 py-2 text-xs">
            CERRADA
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ClosureMetric
            label="Caja inicial"
            value={formatCurrency(Number(closure?.openingCash || 0))}
            accent="sand"
          />

          <ClosureMetric
            label="Ventas"
            value={formatCurrency(Number(closure?.salesTotal || 0))}
            accent="brand"
          />

          <ClosureMetric
            label="Gastos"
            value={formatCurrency(Number(closure?.expensesTotal || 0))}
            accent="danger"
          />

          <ClosureMetric
            label="Descuentos"
            value={formatCurrency(Number(closure?.discountsTotal || 0))}
            accent="ink"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ClosureDetail
            label="Responsable del cierre"
            value={
              closure?.closedByUser?.name ||
              closure?.closedByUser?.email ||
              "Sin responsable"
            }
          />

          <ClosureDetail
            label="Nota"
            value={closure?.note || "Sin nota"}
          />

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
          <div className="overflow-hidden rounded-[1.75rem] border border-amber-200 bg-amber-50/70">
            <div className="border-b border-amber-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-amber-500" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-amber-800">
                  Reapertura
                </span>
              </div>

              <h3 className="mt-2 font-black text-amber-950">
                Reabrir jornada
              </h3>

              <p className="mt-1 text-sm leading-6 text-amber-900">
                La reapertura debe quedar justificada y registrada en auditoría.
              </p>
            </div>

            <div className="p-5">
              <label className="block text-sm font-bold text-amber-950">
                Motivo de reapertura

                <textarea
                  className="mt-2 min-h-28 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  placeholder="Indica por qué es necesario reabrir la jornada"
                  value={reopenReason}
                  onChange={(e) => onReopenReasonChange(e.target.value)}
                  disabled={saving}
                />
              </label>

              <button
                type="button"
                onClick={onReopenDay}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-3 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={saving}
              >
                {saving ? "Reabriendo..." : "Reabrir jornada"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ClosureMetric({
  label,
  value,
  accent = "sand",
}: {
  label: string;
  value: string;
  accent?: "brand" | "sand" | "ink" | "danger";
}) {
  const accentClassName = {
    brand: "bg-[#a7282d]",
    sand: "bg-[#b4a78d]",
    ink: "bg-[#0b0b0c]",
    danger: "bg-red-500",
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4">
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${accentClassName}`}
      />

      <div className="text-[0.68rem] font-black uppercase tracking-[0.11em] app-muted">
        {label}
      </div>

      <div className="mt-3 text-xl font-black tracking-[-0.03em] text-[#201f1d]">
        {value}
      </div>
    </div>
  );
}

function ClosureDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-black/8 bg-white/80 p-4">
      <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
        {label}
      </div>

      <div className="mt-2 break-words text-sm font-semibold leading-6 text-[#201f1d]">
        {value}
      </div>
    </div>
  );
}
