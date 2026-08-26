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
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />
              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                Inventario
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Stock valorizado
            </h2>

            <p className="mt-1 text-sm app-muted">
              Valor comercial y coste estimado del stock físico.
            </p>
          </div>

          {stockSummary?.stockCostValueEstimated ? (
            <span className="inline-flex w-fit shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
              Coste estimado
            </span>
          ) : null}
        </div>
      </div>

      {stockSummary ? (
        <div className="grid gap-3 p-5 sm:p-6">
          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#a7282d]" />
            <div className="text-sm app-muted">Valor stock disponible</div>
            <div className="mt-1 break-words text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              {formatCurrency(stockSummary.availableStockValue)}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#b4a78d]" />
            <div className="text-sm app-muted">Valor stock reserva</div>
            <div className="mt-1 break-words text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              {formatCurrency(stockSummary.reserveStockValue)}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#0b0b0c]/75" />
            <div className="text-sm app-muted">Valor del stock físico</div>
            <div className="mt-1 break-words text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              {formatCurrency(stockSummary.totalPhysicalStockValue)}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f3f0e9]/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#861f23]" />
            <div className="text-sm app-muted">Coste del stock físico</div>
            <div className="mt-1 break-words text-3xl font-black tracking-[-0.04em] text-[#861f23]">
              {formatCurrency(stockSummary.stockCostValue)}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Sin valoración de stock"
          message="No hay resumen de stock disponible para esta lectura."
          className="m-5 rounded-[1.5rem] bg-white/70 sm:m-6"
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
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`h-[2px] w-6 rounded-full ${
              products.length > 0 ? "bg-red-500" : "bg-emerald-500"
            }`}
          />

          <span
            className={`text-[0.65rem] font-black uppercase tracking-[0.2em] ${
              products.length > 0 ? "text-red-700" : "text-emerald-700"
            }`}
          >
            Inventario
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Stock bajo
            </h2>

            <p className="mt-1 text-sm app-muted">
              {isAdmin
                ? "Prioridades de reposición o ajuste de inventario."
                : "Productos por debajo del mínimo configurado."}
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              products.length > 0
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {products.length > 0
              ? `${products.length} alerta${products.length === 1 ? "" : "s"}`
              : "Sin alertas"}
          </span>
        </div>
      </div>

      <div className={isAdmin ? "grid gap-2 p-5 sm:p-6" : "space-y-2 p-5 sm:p-6"}>
        {products.length === 0 ? (
          <EmptyState
            title="Stock bajo sin alertas"
            message="Todos los productos visibles están dentro del mínimo configurado."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className={`flex flex-col gap-3 rounded-[1.25rem] border border-red-100 bg-red-50/45 p-3.5 transition-all hover:border-red-200 hover:bg-red-50/70 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="min-w-0">
                <div className="break-words font-black text-[#201f1d]">
                  {product.name}
                </div>

                <div className="mt-1 break-words text-sm app-muted">
                  Mínimo {formatQty(product.minStock, product.unit)}
                </div>
              </div>

              {isAdmin ? (
                <div className="shrink-0 text-left sm:text-right">
                  <div className="text-lg font-black text-red-700">
                    {formatQty(product.stock, product.unit)}
                  </div>

                  <div className="break-words text-xs app-muted">
                    {product.category}
                  </div>
                </div>
              ) : (
                <div className="shrink-0 text-lg font-black text-red-700">
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
