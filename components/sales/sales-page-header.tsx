import type { TodayTotals } from "@/lib/helpers/sales-cart";

export function SalesPageHeader({
  showRecentSales,
  visibleToday,
  visibleTodayLoading,
  onToggleRecentSales,
}: {
  showRecentSales: boolean;
  visibleToday: TodayTotals;
  visibleTodayLoading: boolean;
  onToggleRecentSales: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-3xl font-black tracking-tight">TPV de retiradas</h1>
        <p className="text-sm app-muted">
          Modo mostrador/tablet{" \u00b7 "}carrito multi-producto
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <button
          type="button"
          aria-controls="recent-sales-panel"
          aria-expanded={showRecentSales}
          onClick={onToggleRecentSales}
          className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          {showRecentSales
            ? "Ocultar \u00faltimas retiradas"
            : "Ver \u00faltimas retiradas"}
        </button>

        <div className="app-panel rounded-2xl p-3 text-sm">
          {visibleTodayLoading ? (
            <>Hoy: cargando consumo y límites...</>
          ) : (
            <>
              Hoy: <strong>{visibleToday.grams.toFixed(2)} g</strong> /{" "}
              {visibleToday.limits.dailyLimitG} g{" \u00b7 "}
              <strong>{visibleToday.units.toFixed(0)} ud</strong> /{" "}
              {visibleToday.limits.dailyLimitUd} ud
            </>
          )}
        </div>
      </div>
    </div>
  );
}
