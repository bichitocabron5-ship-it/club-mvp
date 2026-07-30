import { DashboardStaffAccessSection } from "@/components/dashboard/dashboard-access-section";
import type { DashboardQuickLink } from "@/components/dashboard/dashboard-quick-links";
import { DashboardQuickLinks } from "@/components/dashboard/dashboard-quick-links";
import { DashboardStatusBar } from "@/components/dashboard/dashboard-status-bar";
import { DashboardLowStockSection } from "@/components/dashboard/dashboard-stock-section";
import { DashboardSummaryCards } from "@/components/dashboard/dashboard-summary-cards";
import { PageHeader } from "@/components/ui/page-header";
import type { DashboardData } from "@/lib/types";

export function DashboardStaffView({
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
        title="Panel operativo"
        description="Vista reducida para personal con accesos directos y alertas operativas básicas."
      />

      <DashboardStatusBar
        generatedAt={data.generatedAt}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
        onRefresh={onRefresh}
      />

      <DashboardSummaryCards data={data} variant="staff" />
      <DashboardQuickLinks links={quickLinks} />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardLowStockSection products={data.lowStockProducts} variant="staff" />
        <DashboardStaffAccessSection accessLogs={data.recentAccessLogs} />
      </section>
    </main>
  );
}
