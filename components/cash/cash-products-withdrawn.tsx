import { formatCurrency, formatQty } from "@/lib/helpers/cash-formatters";
import type { DayClosureSummary } from "@/lib/types";

export function CashProductsWithdrawn({
  summary,
}: {
  summary: DayClosureSummary | null;
}) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Retiradas
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Productos más retirados
            </h2>

            <p className="mt-1 text-sm app-muted">
              Resumen diario por cantidad retirada.
            </p>
          </div>

          <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
            {summary?.productsMostWithdrawn.length || 0} productos
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {summary?.productsMostWithdrawn.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.productsMostWithdrawn.map((product, index) => (
              <article
                key={product.productId}
                className="group relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4 transition-all hover:-translate-y-0.5 hover:border-[#a7282d]/20 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="break-words font-black text-[#201f1d]">
                      {product.name}
                    </div>

                    <div className="mt-1 text-sm app-muted">
                      {product.salesCount} ticket
                      {product.salesCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Cantidad
                    </div>

                    <div className="mt-1 text-xl font-black tracking-[-0.03em] text-[#201f1d]">
                      {formatQty(product.qty, product.unit)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#f8f3f1] px-3 py-3">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Importe
                    </div>

                    <div className="mt-1 text-xl font-black tracking-[-0.03em] text-[#861f23]">
                      {formatCurrency(product.revenue)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
            <div className="font-black text-[#201f1d]">
              Sin retiradas registradas
            </div>

            <p className="mt-2 text-sm app-muted">
              Los productos retirados durante la jornada aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
