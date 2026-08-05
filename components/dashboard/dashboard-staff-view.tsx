import {
  DashboardLayout,
  type DashboardPreferencesConfig,
  type DashboardPreferencesSaveHandler,
} from "@/components/dashboard/dashboard-layout";
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
  preferences,
  onPreferencesSave,
  isRefreshing,
  refreshError,
  onRefresh,
}: {
  data: DashboardData;
  quickLinks: DashboardQuickLink[];
  preferences: DashboardPreferencesConfig | null;
  onPreferencesSave: DashboardPreferencesSaveHandler;
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
      preferences={preferences}
      onPreferencesSave={onPreferencesSave}
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
