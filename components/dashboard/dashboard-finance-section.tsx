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
      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />
            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Finanzas
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Últimos 7 días
          </h2>

          <p className="mt-1 text-sm app-muted">
            Ingresos, gastos y rentabilidad diaria.
          </p>
        </div>

        <div className="p-5 sm:p-6">
        </div>

        <div className="mt-4 space-y-2">
          {!data.dailyFinance || data.dailyFinance.length === 0 ? (
            <EmptyState
              title="Sin datos financieros recientes"
              message="Todavía no hay movimientos suficientes para mostrar esta comparativa."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.dailyFinance.map((day) => (
              <div
                key={day.date}
                className="grid gap-3 rounded-[1.25rem] border border-black/8 bg-white/88 p-3.5 transition-colors hover:bg-white sm:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1fr_1fr_1fr]"
              >
                <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <div className="break-words font-semibold">{day.date}</div>
                  <div className="text-xs app-muted">{day.salesCount} venta(s)</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase app-muted">Ingresos</div>
                  <div className="break-words font-black">
                    {formatCurrency(day.income)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase app-muted">Gastos</div>
                  <div className="break-words font-black text-red-700">
                    {formatCurrency(day.expense)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase app-muted">
                    Beneficio bruto
                  </div>
                  <div className="break-words font-black text-[#861f23]">
                    {formatCurrency(day.grossProfit)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase app-muted">
                    Beneficio neto
                  </div>
                  <div
                    className={`break-words font-black ${
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

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />
            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
              Actividad
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Ventas recientes
          </h2>

          <p className="mt-1 text-sm app-muted">
            Últimos movimientos registrados durante el día.
          </p>
        </div>

        <div className="p-5 sm:p-6">
        </div>

        <div className="mt-4 space-y-2">
          {!data.recentSales || data.recentSales.length === 0 ? (
            <EmptyState
              title="Sin ventas recientes"
              message="Las ventas del día aparecerán aquí cuando se registren."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="rounded-[1.25rem] border border-black/8 bg-white/88 p-3.5 transition-all hover:border-[#a7282d]/20 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">
                      {sale.member.fullName} - {sale.product.name}
                    </div>
                    <div className="mt-1 break-words text-sm app-muted">
                      {formatQty(sale.qty, sale.product.unit)} -{" "}
                      {formatTime(sale.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div
                      className={`mt-1 break-words font-black ${
                        Number(sale.profit || 0) >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatCurrency(sale.profit || 0)}
                    </div>
                    <div className="text-xs app-muted">
                      Original {formatCurrency(sale.originalAmount || sale.totalAmount)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">
                      Coste unitario
                    </div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(sale.unitCost || 0)}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">
                      Descuento
                    </div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(sale.discountAmount || 0)}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl bg-black/[0.03] px-3 py-2">
                    <div className="text-xs uppercase app-muted">
                      Beneficio
                    </div>
                    <div className="mt-1 break-words font-black">
                      {formatCurrency(sale.profit || 0)}
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
