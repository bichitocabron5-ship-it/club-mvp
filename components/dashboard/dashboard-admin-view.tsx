import { DashboardAccessSection } from "@/components/dashboard/dashboard-access-section";
import { DashboardAlertsSection } from "@/components/dashboard/dashboard-alerts-section";
import { DashboardAuditSection } from "@/components/dashboard/dashboard-audit-section";
import { DashboardCashSection } from "@/components/dashboard/dashboard-cash-section";
import { DashboardFinanceSection } from "@/components/dashboard/dashboard-finance-section";
import type { DashboardQuickLink } from "@/components/dashboard/dashboard-quick-links";
import { DashboardQuickLinks } from "@/components/dashboard/dashboard-quick-links";
import { DashboardSalesSection } from "@/components/dashboard/dashboard-sales-section";
import { DashboardStatusBar } from "@/components/dashboard/dashboard-status-bar";
import {
  DashboardLowStockSection,
  DashboardStockValuationSection,
} from "@/components/dashboard/dashboard-stock-section";
import { DashboardSummaryCards } from "@/components/dashboard/dashboard-summary-cards";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/helpers/dashboard-formatters";
import type { DashboardData } from "@/lib/types";

export function DashboardAdminView({
  data,
  quickLinks,
  isRefreshing,
  refreshError,
  onRefresh,
}: {
  data: DashboardData;
  quickLinks: DashboardQuickLink[];
  isRefreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
}) {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <PageHeader
        title="Panel ejecutivo"
        description={`Corte generado ${formatDateTime(data.generatedAt)} con beneficio basado en Sale.profit y costes congelados por venta.`}
      />

      <DashboardStatusBar
        generatedAt={data.generatedAt}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={onRefresh}
      />

      <DashboardSummaryCards data={data} variant="admin" />
      <DashboardQuickLinks links={quickLinks} />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardCashSection cash={data.cash} />
        <DashboardStockValuationSection stockSummary={data.stockSummary} />
      </section>

      <DashboardSalesSection data={data} />
      <DashboardFinanceSection data={data} />

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardAlertsSection alerts={data.pendingAlerts} />
        <DashboardAuditSection logs={data.recentAuditLogs} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardAccessSection data={data} />
        <DashboardLowStockSection products={data.lowStockProducts} variant="admin" />
      </section>
    </main>
  );
}
