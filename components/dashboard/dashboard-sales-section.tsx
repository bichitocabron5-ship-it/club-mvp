import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCurrency,
  formatPercent,
  formatQty,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardData } from "@/lib/types";

function MarginBadge({
  marginPercent,
  estimated,
}: {
  marginPercent: number;
  estimated: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 font-bold text-[#6d6860]">
        {formatPercent(marginPercent)}
      </span>

      {estimated ? (
        <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
          Estimado
        </span>
      ) : null}
    </div>
  );
}

export function DashboardSalesSection({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />
            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Ventas
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Top productos hoy
          </h2>

          <p className="mt-1 text-sm app-muted">
            Ranking por ingresos y beneficio.
          </p>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          {!data.topProductsToday || data.topProductsToday.length === 0 ? (
            <EmptyState
              title="Sin ventas de productos hoy"
              message="El ranking se completará cuando se registren ventas del día."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.topProductsToday.slice(0, 8).map((product, index) => (
              <div
                key={product.productId}
                className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4 transition-all hover:border-[#a7282d]/20 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0">
                      <div className="break-words font-black text-[#201f1d]">
                        {product.name}
                      </div>

                      <div className="mt-1 break-words text-sm app-muted">
                        {product.salesCount} venta(s) ·{" "}
                        {formatQty(product.qty, product.unit)}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <MarginBadge
                      marginPercent={product.marginPercent}
                      estimated={product.marginIsEstimated}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl bg-[#f7f4ee] px-3 py-2.5">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Ingresos
                    </div>

                    <div className="mt-1 break-words font-black text-[#201f1d]">
                      {formatCurrency(product.revenue)}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-2xl bg-emerald-50/70 px-3 py-2.5">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/70">
                      Beneficio
                    </div>

                    <div className="mt-1 break-words font-black text-emerald-700">
                      {formatCurrency(product.profit)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />
            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
              Socios
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Top socios hoy
          </h2>

          <p className="mt-1 text-sm app-muted">
            Actividad acumulada por socio durante el día.
          </p>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          {!data.topMembersToday || data.topMembersToday.length === 0 ? (
            <EmptyState
              title="Sin ventas por socio hoy"
              message="El ranking se completará cuando haya ventas asociadas a socios."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.topMembersToday.slice(0, 8).map((member, index) => (
              <div
                key={member.memberId}
                className="rounded-[1.5rem] border border-black/8 bg-white/88 p-4 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3f0e9] px-2 text-xs font-black text-[#861f23]">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0">
                      <div className="break-words font-black text-[#201f1d]">
                        {member.fullName}
                      </div>

                      <div className="mt-1 break-words text-sm app-muted">
                        {member.dni} · {member.salesCount} venta(s) ·{" "}
                        {formatQty(member.totalQty)}
                      </div>
                    </div>
                  </div>

                  <MarginBadge
                    marginPercent={member.marginPercent}
                    estimated={member.marginIsEstimated}
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#f7f4ee] px-3 py-2.5">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Ingresos
                    </div>

                    <div className="mt-1 break-words font-black">
                      {formatCurrency(member.totalAmount)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-emerald-50/70 px-3 py-2.5">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/70">
                      Beneficio
                    </div>

                    <div className="mt-1 break-words font-black text-emerald-700">
                      {formatCurrency(member.profit)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
