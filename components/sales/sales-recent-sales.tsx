import {
  formatCurrencyLabel,
  formatQtyLabel,
  formatTimeLabel,
} from "@/lib/helpers/sales-formatters";
import type { RecentSale } from "@/lib/helpers/sales-cart";

export function SalesRecentSales({
  cancelingSaleId,
  recentSales,
  recentSalesDayClosed,
  recentSalesError,
  showRecentSales,
  onCancelRecentSale,
  onRefreshRecentSales,
}: {
  cancelingSaleId: number | null;
  recentSales: RecentSale[];
  recentSalesDayClosed: boolean;
  recentSalesError: string;
  showRecentSales: boolean;
  onCancelRecentSale: (sale: RecentSale) => Promise<void>;
  onRefreshRecentSales: () => void;
}) {
  return (
    <section
      id="recent-sales-panel"
      hidden={!showRecentSales}
      className="app-panel mt-4 rounded-3xl p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Últimas retiradas de hoy</h2>
          {recentSalesDayClosed ? (
            <div className="mt-1 text-xs text-amber-700">
              El día está cerrado; no se pueden anular retiradas.
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefreshRecentSales}
          className="app-button-secondary rounded-full px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          Actualizar
        </button>
      </div>

      {recentSalesError ? (
        <div className="rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          {recentSalesError}
        </div>
      ) : recentSales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 p-4 text-sm app-muted">
          No hay retiradas registradas hoy.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {recentSales.map((sale) => {
            const cancelled = Boolean(sale.cancelledAt);
            const amount = sale.finalAmount ?? sale.totalAmount;

            return (
              <div
                key={sale.id}
                className={`rounded-2xl border border-black/8 bg-white/82 p-3 ${
                  cancelled ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>#{sale.id}</span>
                      <span>{sale.product.name}</span>
                      {cancelled ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                          Anulada
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm app-muted">
                      {sale.member.fullName} -{" "}
                      {formatQtyLabel(
                        sale.qty,
                        sale.product.unit === "UD" ? "UD" : "G"
                      )}{" "}
                      - {formatTimeLabel(sale.createdAt)}
                    </div>
                    {cancelled && sale.cancelReason ? (
                      <div className="mt-1 text-xs text-red-700">
                        Motivo: {sale.cancelReason}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-black ${
                        cancelled ? "app-muted line-through" : ""
                      }`}
                    >
                      {formatCurrencyLabel(amount)}
                    </div>
                    {!cancelled ? (
                      <button
                        type="button"
                        onClick={() => {
                          void onCancelRecentSale(sale);
                        }}
                        disabled={!sale.canCancel || cancelingSaleId !== null}
                        className="mt-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:opacity-40"
                      >
                        {cancelingSaleId === sale.id ? "Anulando..." : "Anular"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
