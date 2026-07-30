import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCurrency,
  formatQty,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardStockSummary, ProductSummary } from "@/lib/types";

export function DashboardStockValuationSection({
  stockSummary,
}: {
  stockSummary: DashboardStockSummary | null;
}) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Stock valorizado</h2>
          <p className="mt-1 text-sm app-muted">
            Valor comercial y coste estimado del stock físico.
          </p>
        </div>
        {stockSummary?.stockCostValueEstimated ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            Coste estimado
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Valor stock disponible</div>
          <div className="mt-1 text-3xl font-black">
            {formatCurrency(stockSummary?.availableStockValue || 0)}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Valor stock reserva</div>
          <div className="mt-1 text-3xl font-black">
            {formatCurrency(stockSummary?.reserveStockValue || 0)}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Valor del stock físico</div>
          <div className="mt-1 text-3xl font-black">
            {formatCurrency(stockSummary?.totalPhysicalStockValue || 0)}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Coste del stock físico</div>
          <div className="mt-1 text-3xl font-black">
            {formatCurrency(stockSummary?.stockCostValue || 0)}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardLowStockSection({
  products,
  variant,
}: {
  products: ProductSummary[];
  variant: "admin" | "staff";
}) {
  const isAdmin = variant === "admin";

  return (
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Stock bajo</h2>
      <p className="mt-1 text-sm app-muted">
        {isAdmin
          ? "Prioridades de reposición o ajuste de inventario."
          : "Productos por debajo del mínimo configurado."}
      </p>

      <div className={isAdmin ? "mt-4 grid gap-2" : "mt-4 space-y-2"}>
        {products.length === 0 ? (
          <EmptyState message="Sin alertas de stock." className="rounded-[1.5rem]" />
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className={`flex items-center justify-between rounded-[1.25rem] border border-black/8 ${
                isAdmin ? "bg-white/85" : "bg-white/80"
              } p-3`}
            >
              <div>
                <div className="font-semibold">{product.name}</div>
                <div className="text-sm app-muted">
                  Mínimo {formatQty(product.minStock, product.unit)}
                </div>
              </div>
              {isAdmin ? (
                <div className="text-right">
                  <div className="font-black text-red-700">
                    {formatQty(product.stock, product.unit)}
                  </div>
                  <div className="text-xs app-muted">{product.category}</div>
                </div>
              ) : (
                <div className="font-black text-red-700">
                  {formatQty(product.stock, product.unit)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
