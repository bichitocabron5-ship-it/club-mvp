import { formatCurrency, formatQty } from "@/lib/helpers/cash-formatters";
import type { DayClosureSummary } from "@/lib/types";

export function CashProductsWithdrawn({
  summary,
}: {
  summary: DayClosureSummary | null;
}) {
  return (
    <section className="app-panel mb-6 rounded-3xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Productos mas retirados</h2>
          <p className="mt-1 text-sm text-gray-500">
            Resumen diario por cantidad retirada.
          </p>
        </div>
        <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
          {summary?.productsMostWithdrawn.length || 0} productos
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary?.productsMostWithdrawn.length ? (
          summary.productsMostWithdrawn.map((product) => (
            <div
              key={product.productId}
              className="rounded-2xl border border-black/8 bg-white/70 p-4"
            >
              <div className="font-semibold">{product.name}</div>
              <div className="mt-1 text-sm text-gray-500">
                {product.salesCount} ticket(s)
              </div>
              <div className="mt-3 text-xl font-black">
                {formatQty(product.qty, product.unit)}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {formatCurrency(product.revenue)}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">
            No hay retiradas registradas hoy.
          </div>
        )}
      </div>
    </section>
  );
}
