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
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
            Apertura
          </span>
        </div>

        <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
          Abrir jornada
        </h2>

        <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
          Registra la caja inicial para abrir el día y establecer la base del
          cierre diario.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="text-sm font-bold text-[#201f1d]">
            Caja inicial

            <div className="relative mt-2">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-12 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => onOpeningCashChange(e.target.value)}
                disabled={!isAdmin || saving}
              />

              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold app-muted">
                €
              </span>
            </div>

            <span className="mt-2 block text-xs font-normal app-muted">
              Efectivo disponible al comienzo de la jornada.
            </span>
          </label>

          {isAdmin ? (
            <button
              type="button"
              onClick={onOpenDay}
              className="app-button-primary inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              disabled={saving}
            >
              {saving ? "Abriendo..." : "Abrir jornada"}
            </button>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Solo el administrador puede abrir la jornada.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
