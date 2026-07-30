export function CashOpenDialog({
  isVisible,
  isAdmin,
  saving,
  openingCash,
  onOpeningCashChange,
  onOpenDay,
}: {
  isVisible: boolean;
  isAdmin: boolean;
  saving: boolean;
  openingCash: string;
  onOpeningCashChange: (value: string) => void;
  onOpenDay: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="app-panel mb-6 rounded-3xl p-4 md:p-5">
      <h2 className="text-xl font-black">Abrir turno/dia</h2>
      <p className="mt-1 text-sm text-gray-500">
        Registra la caja inicial para dejar el dia abierto y preparar el cierre
        con una base clara.
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
            onChange={(e) => onOpeningCashChange(e.target.value)}
            disabled={!isAdmin || saving}
          />
        </label>

        {isAdmin ? (
          <button
            type="button"
            onClick={onOpenDay}
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
  );
}
