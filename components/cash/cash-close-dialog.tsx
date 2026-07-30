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
          onChange={(e) => onCountedCashChange(e.target.value)}
          disabled={!isAdmin || saving}
        />

        <select
          className="rounded-2xl border border-black/10 bg-white/80 p-3"
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
      </div>

      <textarea
        className="mt-3 min-h-24 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
        placeholder={
          noteRequired
            ? "Nota obligatoria por diferencia o reapertura"
            : "Nota de cierre"
        }
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={!isAdmin || saving}
      />

      {noteRequired ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Diferencia detectada o dia reabierto: deja una nota antes de cerrar.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
        <div>
          <div className="text-sm text-gray-500">Responsable</div>
          <div className="font-black">{responsibleLabel}</div>
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
            onClick={onCloseDay}
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
  );
}
