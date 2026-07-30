import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCurrency,
  formatQty,
  formatTime,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardData } from "@/lib/types";

export function DashboardFinanceSection({ data }: { data: DashboardData }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="app-panel rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Finanzas últimos 7 días</h2>
        <p className="mt-1 text-sm app-muted">
          Ingresos y gastos de caja junto al beneficio bruto por ventas.
        </p>

        <div className="mt-4 space-y-2">
          {!data.dailyFinance || data.dailyFinance.length === 0 ? (
            <EmptyState message="Sin datos financieros recientes." className="rounded-[1.5rem]" />
          ) : (
            data.dailyFinance.map((day) => (
              <div
                key={day.date}
                className="grid gap-2 rounded-[1.25rem] border border-black/8 bg-white/85 p-3 md:grid-cols-[0.8fr_1fr_1fr_1fr_1fr_auto]"
              >
                <div>
                  <div className="font-semibold">{day.date}</div>
                  <div className="text-xs app-muted">{day.salesCount} venta(s)</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] app-muted">Ingresos</div>
                  <div className="font-black">{formatCurrency(day.income)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] app-muted">Gastos</div>
                  <div className="font-black text-red-700">{formatCurrency(day.expense)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] app-muted">
                    Beneficio bruto
                  </div>
                  <div className="font-black">{formatCurrency(day.grossProfit)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] app-muted">Beneficio neto</div>
                  <div
                    className={`font-black ${
                      day.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatCurrency(day.netProfit)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="app-panel rounded-[2rem] p-5">
        <h2 className="text-lg font-black">Ventas recientes</h2>
        <p className="mt-1 text-sm app-muted">
          Últimas ventas del día con coste unitario congelado y beneficio.
        </p>

        <div className="mt-4 space-y-2">
          {!data.recentSales || data.recentSales.length === 0 ? (
            <EmptyState message="Sin ventas recientes." className="rounded-[1.5rem]" />
          ) : (
            data.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="rounded-[1.25rem] border border-black/8 bg-white/85 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {sale.member.fullName} · {sale.product.name}
                    </div>
                    <div className="mt-1 text-sm app-muted">
                      {formatQty(sale.qty, sale.product.unit)} · {formatTime(sale.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black">{formatCurrency(sale.finalAmount || 0)}</div>
                    <div className="text-xs app-muted">
                      Original {formatCurrency(sale.originalAmount || sale.totalAmount)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Coste unitario
                    </div>
                    <div className="mt-1 font-black">
                      {formatCurrency(sale.unitCost || 0)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Descuento
                    </div>
                    <div className="mt-1 font-black">
                      {formatCurrency(sale.discountAmount || 0)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase tracking-[0.18em] app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 font-black">{formatCurrency(sale.profit || 0)}</div>
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
