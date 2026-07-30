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
    <div className="flex items-center gap-2 text-xs">
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
            <EmptyState message="Sin ventas de productos hoy." className="rounded-[1.5rem]" />
          ) : (
            data.topProductsToday.slice(0, 8).map((product) => (
              <div
                key={product.productId}
                className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="mt-1 text-sm app-muted">
                      {product.salesCount} venta(s) · {formatQty(product.qty, product.unit)}
                    </div>
                  </div>
                  <MarginBadge
                    marginPercent={product.marginPercent}
                    estimated={product.marginIsEstimated}
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">Revenue</div>
                    <div className="mt-1 font-black">{formatCurrency(product.revenue)}</div>
                  </div>
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 font-black">{formatCurrency(product.profit)}</div>
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
            <EmptyState message="Sin ventas por socio hoy." className="rounded-[1.5rem]" />
          ) : (
            data.topMembersToday.slice(0, 8).map((member) => (
              <div
                key={member.memberId}
                className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{member.fullName}</div>
                    <div className="mt-1 text-sm app-muted">
                      {member.dni} · {member.salesCount} venta(s) · {formatQty(member.totalQty)}
                    </div>
                  </div>
                  <MarginBadge
                    marginPercent={member.marginPercent}
                    estimated={member.marginIsEstimated}
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">Revenue</div>
                    <div className="mt-1 font-black">
                      {formatCurrency(member.totalAmount)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 font-black">{formatCurrency(member.profit)}</div>
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
