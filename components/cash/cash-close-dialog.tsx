import {
  formatCurrency,
  formatInventoryLabel,
} from "@/lib/helpers/cash-formatters";
import type { DayClosureInventoryOption, DayClosureSummary } from "@/lib/types";

export function CashCloseDialog({
  isVisible,
  isAdmin,
  saving,
  summary,
  inventoryOptions,
  inventoryCountId,
  countedCash,
  note,
  noteRequired,
  draftDifference,
  responsibleLabel,
  onInventoryCountIdChange,
  onCountedCashChange,
  onNoteChange,
  onCloseDay,
}: {
  isVisible: boolean;
  isAdmin: boolean;
  saving: boolean;
  summary: DayClosureSummary | null;
  inventoryOptions: DayClosureInventoryOption[];
  inventoryCountId: string;
  countedCash: string;
  note: string;
  noteRequired: boolean;
  draftDifference: number;
  responsibleLabel: string;
  onInventoryCountIdChange: (value: string) => void;
  onCountedCashChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCloseDay: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
            Cierre diario
          </span>
        </div>

        <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
          Preparar cierre de jornada
        </h2>

        <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
          El sistema recalculará ventas, gastos, ingresos, descuentos y caja
          esperada antes de guardar el cierre definitivo.
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-[#201f1d]">
            Caja contada

            <div className="relative mt-2">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-12 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={countedCash}
                onChange={(e) => onCountedCashChange(e.target.value)}
                disabled={!isAdmin || saving}
              />

              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold app-muted">
                €
              </span>
            </div>

            <span className="mt-2 block text-xs font-normal app-muted">
              Efectivo contado físicamente antes de cerrar.
            </span>
          </label>

          <label className="text-sm font-bold text-[#201f1d]">
            Conteo de inventario

            <select
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              value={inventoryCountId}
              onChange={(e) => onInventoryCountIdChange(e.target.value)}
              disabled={!isAdmin || saving || inventoryOptions.length === 0}
            >
              <option value="">Sin conteo de inventario vinculado</option>

              {inventoryOptions.map((count) => (
                <option key={count.id} value={count.id}>
                  {formatInventoryLabel(count)}
                </option>
              ))}
            </select>

            <span className="mt-2 block text-xs font-normal app-muted">
              Puedes vincular un conteo confirmado al cierre del día.
            </span>
          </label>
        </div>

        <label className="block text-sm font-bold text-[#201f1d]">
          Nota de cierre

          <textarea
            className="mt-2 min-h-28 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
            placeholder={
              noteRequired
                ? "Explica la diferencia o el motivo relacionado con la reapertura"
                : "Añade una observación si es necesario"
            }
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            disabled={!isAdmin || saving}
          />
        </label>

        {noteRequired ? (
          <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-black"
              >
                !
              </span>

              <div>
                <div className="font-black">Nota obligatoria</div>

                <div className="mt-1 leading-6">
                  Se ha detectado una diferencia de caja o la jornada fue
                  reabierta. Debes dejar una explicación antes de cerrar.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[1.75rem] border border-black/8 bg-[#f7f4ee]/75">
          <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                Responsable
              </div>

              <div className="mt-2 break-words font-black text-[#201f1d]">
                {responsibleLabel}
              </div>
            </div>

            <div className="rounded-2xl bg-white/80 p-4">
              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                Caja esperada
              </div>

              <div className="mt-2 text-xl font-black tracking-[-0.03em] text-[#201f1d]">
                {formatCurrency(Number(summary?.expectedCash || 0))}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                draftDifference === 0
                  ? "border-emerald-100 bg-emerald-50/80"
                  : "border-red-100 bg-red-50/80"
              }`}
            >
              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                Diferencia prevista
              </div>

              <div
                className={`mt-2 text-xl font-black tracking-[-0.03em] ${
                  draftDifference === 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(draftDifference)}
              </div>
            </div>
          </div>

          <div className="border-t border-black/7 p-4 sm:p-5">
            {isAdmin ? (
              <button
                type="button"
                onClick={onCloseDay}
                className="app-button-danger inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={saving}
              >
                {saving ? "Cerrando..." : "Cerrar jornada"}
              </button>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Solo el administrador puede cerrar la jornada.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
