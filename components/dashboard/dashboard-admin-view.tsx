import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import type { DashboardQuickLink } from "@/components/dashboard/dashboard-quick-links";
import { DashboardStatusBar } from "@/components/dashboard/dashboard-status-bar";
import {
  adminDashboardSections,
  buildAdminDashboardWidgets,
} from "@/components/dashboard/dashboard-widgets";
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
  const widgets = buildAdminDashboardWidgets({ data, quickLinks });

  return (
    <DashboardLayout
      title="Panel ejecutivo"
      description={`Corte generado ${formatDateTime(data.generatedAt)} con beneficio basado en Sale.profit y costes congelados por venta.`}
      sections={adminDashboardSections}
      widgets={widgets}
      statusBar={
        <DashboardStatusBar
          generatedAt={data.generatedAt}
          isRefreshing={isRefreshing}
          refreshError={refreshError}
          onRefresh={onRefresh}
        />
      }
    />
  );
}
