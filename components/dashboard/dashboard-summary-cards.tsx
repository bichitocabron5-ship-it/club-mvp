import { StatCard } from "@/components/dashboard/stat-card";
import {
  formatCurrency,
  formatPercent,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardData } from "@/lib/types";

export function DashboardSummaryCards({
  data,
  variant,
}: {
  data: DashboardData;
  variant: "admin" | "staff";
}) {
  if (variant === "staff") {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Socios con acceso hoy" value={data.summary.activeMembersToday} />
        <StatCard label="Dentro ahora" value={data.summary.currentInsideCount} />
        <StatCard
          label="Ventas hoy"
          value={data.summary.salesTodayCount}
          comparison={data.comparisons.salesCount}
        />
        <StatCard
          label="Stock bajo"
          value={data.summary.lowStockProductsCount}
          className={data.summary.lowStockProductsCount > 0 ? "bg-red-50" : "bg-emerald-50"}
        />
      </section>
    );
  }

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Ventas hoy"
          value={formatCurrency(data.summary.salesTodayTotal)}
          comparison={data.comparisons.salesTotal}
          className="bg-emerald-50"
          valueClassName="text-2xl font-black text-emerald-800 md:text-3xl"
        />
        <StatCard
          label="Tickets hoy"
          value={data.summary.salesTodayCount}
          comparison={data.comparisons.salesCount}
        />
        <StatCard
          label="Beneficio hoy"
          value={formatCurrency(data.summary.profitToday)}
          className={data.summary.profitToday >= 0 ? "bg-sky-50" : "bg-red-50"}
          valueClassName={
            data.summary.profitToday >= 0
              ? "text-2xl font-black text-sky-800 md:text-3xl"
              : "text-2xl font-black text-red-800 md:text-3xl"
          }
        />
        <StatCard label="Margen medio" value={formatPercent(data.summary.marginPercent)} />
        <StatCard
          label="Descuentos hoy"
          value={formatCurrency(data.summary.discountsTodayTotal)}
        />
      </section>

      {data.summary.marginIsEstimated ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El margen de hoy es estimado porque existen ventas sin coste histórico completo.
        </div>
      ) : null}
    </>
  );
}
