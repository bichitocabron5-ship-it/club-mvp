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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black">Stock valorizado</h2>
          <p className="mt-1 text-sm app-muted">
            Valor comercial y coste estimado del stock fisico.
          </p>
        </div>
        {stockSummary?.stockCostValueEstimated ? (
          <span className="inline-flex w-fit shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            Coste estimado
          </span>
        ) : null}
      </div>

      {stockSummary ? (
        <div className="mt-4 grid gap-3">
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-sm app-muted">Valor stock disponible</div>
            <div className="mt-1 break-words text-3xl font-black">
              {formatCurrency(stockSummary.availableStockValue)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-sm app-muted">Valor stock reserva</div>
            <div className="mt-1 break-words text-3xl font-black">
              {formatCurrency(stockSummary.reserveStockValue)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-sm app-muted">Valor del stock fisico</div>
            <div className="mt-1 break-words text-3xl font-black">
              {formatCurrency(stockSummary.totalPhysicalStockValue)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-sm app-muted">Coste del stock fisico</div>
            <div className="mt-1 break-words text-3xl font-black">
              {formatCurrency(stockSummary.stockCostValue)}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Sin valoracion de stock"
          message="No hay resumen de stock disponible para esta lectura."
          className="mt-4 rounded-[1.5rem] bg-white/70"
        />
      )}
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
          ? "Prioridades de reposicion o ajuste de inventario."
          : "Productos por debajo del minimo configurado."}
      </p>

      <div className={isAdmin ? "mt-4 grid gap-2" : "mt-4 space-y-2"}>
        {products.length === 0 ? (
          <EmptyState
            title="Stock bajo sin alertas"
            message="Todos los productos visibles estan dentro del minimo configurado."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className={`flex flex-col gap-3 rounded-[1.25rem] border border-black/8 sm:flex-row sm:items-center sm:justify-between ${
                isAdmin ? "bg-white/85" : "bg-white/80"
              } p-3`}
            >
              <div className="min-w-0">
                <div className="break-words font-semibold">{product.name}</div>
                <div className="break-words text-sm app-muted">
                  Minimo {formatQty(product.minStock, product.unit)}
                </div>
              </div>
              {isAdmin ? (
                <div className="shrink-0 text-left sm:text-right">
                  <div className="font-black text-red-700">
                    {formatQty(product.stock, product.unit)}
                  </div>
                  <div className="break-words text-xs app-muted">
                    {product.category}
                  </div>
                </div>
              ) : (
                <div className="shrink-0 font-black text-red-700">
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
