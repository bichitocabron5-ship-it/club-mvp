import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import type { DashboardQuickLink } from "@/components/dashboard/dashboard-quick-links";
import { DashboardStatusBar } from "@/components/dashboard/dashboard-status-bar";
import {
  buildStaffDashboardWidgets,
  staffDashboardSections,
} from "@/components/dashboard/dashboard-widgets";
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
  const widgets = buildStaffDashboardWidgets({ data, quickLinks });

  return (
    <DashboardLayout
      title="Panel operativo"
      description="Vista reducida para personal con accesos directos y alertas operativas básicas."
      sections={staffDashboardSections}
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
