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
      <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-800">
        {formatPercent(marginPercent)}
      </span>
      {estimated ? <span className="app-muted">Estimado</span> : null}
    </div>
  );
}

export function DashboardSalesSection({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <section className="app-panel rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Top productos hoy</h2>
        <p className="mt-1 text-sm app-muted">
          Ranking por revenue y beneficio usando Sale.profit.
        </p>

        <div className="mt-4 space-y-3">
          {!data.topProductsToday || data.topProductsToday.length === 0 ? (
            <EmptyState
              title="Sin ventas de productos hoy"
              message="El ranking se completara cuando se registren ventas del dia."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.topProductsToday.slice(0, 8).map((product) => (
              <div
                key={product.productId}
                className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{product.name}</div>
                    <div className="mt-1 break-words text-sm app-muted">
                      {product.salesCount} venta(s) -{" "}
                      {formatQty(product.qty, product.unit)}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MarginBadge
                      marginPercent={product.marginPercent}
                      estimated={product.marginIsEstimated}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">Revenue</div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(product.revenue)}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(product.profit)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="app-panel rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Top socios hoy</h2>
        <p className="mt-1 text-sm app-muted">
          Acumulado por socio con ingreso final y margen medio.
        </p>

        <div className="mt-4 space-y-3">
          {!data.topMembersToday || data.topMembersToday.length === 0 ? (
            <EmptyState
              title="Sin ventas por socio hoy"
              message="El ranking se completara cuando haya ventas asociadas a socios."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.topMembersToday.slice(0, 8).map((member) => (
              <div
                key={member.memberId}
                className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{member.fullName}</div>
                    <div className="mt-1 break-words text-sm app-muted">
                      {member.dni} - {member.salesCount} venta(s) -{" "}
                      {formatQty(member.totalQty)}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MarginBadge
                      marginPercent={member.marginPercent}
                      estimated={member.marginIsEstimated}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">Revenue</div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(member.totalAmount)}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 break-words font-black">
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
