import {
  DashboardAccessSection,
  DashboardStaffAccessSection,
} from "@/components/dashboard/dashboard-access-section";
import { DashboardAlertsSection } from "@/components/dashboard/dashboard-alerts-section";
import { DashboardAuditSection } from "@/components/dashboard/dashboard-audit-section";
import { DashboardCashSection } from "@/components/dashboard/dashboard-cash-section";
import type {
  DashboardSectionConfig,
  DashboardWidgetConfig,
} from "@/components/dashboard/dashboard-layout";
import { DashboardFinanceSection } from "@/components/dashboard/dashboard-finance-section";
import type { DashboardQuickLink } from "@/components/dashboard/dashboard-quick-links";
import { DashboardQuickLinks } from "@/components/dashboard/dashboard-quick-links";
import { DashboardSalesSection } from "@/components/dashboard/dashboard-sales-section";
import {
  DashboardLowStockSection,
  DashboardStockValuationSection,
} from "@/components/dashboard/dashboard-stock-section";
import { DashboardSummaryCards } from "@/components/dashboard/dashboard-summary-cards";
import type { DashboardData } from "@/lib/types";

export const adminDashboardSections: DashboardSectionConfig[] = [
  {
    id: "summary",
    label: "Resumen",
    description: "Indicadores principales y accesos directos del turno.",
  },
  {
    id: "operations",
    label: "Operaciones",
    description: "Caja, ventas, stock y accesos para gestionar el día.",
  },
  {
    id: "audit",
    label: "Auditoría",
    description: "Alertas operativas y trazabilidad reciente del sistema.",
  },
];

export const staffDashboardSections: DashboardSectionConfig[] = [
  adminDashboardSections[0],
  adminDashboardSections[1],
];

export function buildAdminDashboardWidgets({
  data,
  quickLinks,
}: {
  data: DashboardData;
  quickLinks: DashboardQuickLink[];
}): DashboardWidgetConfig[] {
  return [
    {
      id: "kpi-cards",
      sectionId: "summary",
      order: 10,
      className: "xl:col-span-12",
      content: <DashboardSummaryCards data={data} variant="admin" />,
    },
    {
      id: "quick-actions",
      sectionId: "summary",
      order: 20,
      className: "xl:col-span-12",
      content: <DashboardQuickLinks links={quickLinks} />,
    },
    {
      id: "cash",
      sectionId: "operations",
      order: 10,
      className: "xl:col-span-7",
      content: <DashboardCashSection cash={data.cash} />,
    },
    {
      id: "stock-valuation",
      sectionId: "operations",
      order: 20,
      className: "xl:col-span-5",
      content: <DashboardStockValuationSection stockSummary={data.stockSummary} />,
    },
    {
      id: "sales",
      sectionId: "operations",
      order: 30,
      className: "xl:col-span-12",
      content: <DashboardSalesSection data={data} />,
    },
    {
      id: "finance",
      sectionId: "operations",
      order: 40,
      className: "xl:col-span-12",
      content: <DashboardFinanceSection data={data} />,
    },
    {
      id: "access",
      sectionId: "operations",
      order: 50,
      className: "xl:col-span-5",
      content: <DashboardAccessSection data={data} />,
    },
    {
      id: "low-stock",
      sectionId: "operations",
      order: 60,
      className: "xl:col-span-7",
      content: <DashboardLowStockSection products={data.lowStockProducts} variant="admin" />,
    },
    {
      id: "alerts",
      sectionId: "audit",
      order: 10,
      className: "xl:col-span-5",
      content: <DashboardAlertsSection alerts={data.pendingAlerts} />,
    },
    {
      id: "audit",
      sectionId: "audit",
      order: 20,
      className: "xl:col-span-7",
      content: <DashboardAuditSection logs={data.recentAuditLogs} />,
    },
  ];
}

export function buildStaffDashboardWidgets({
  data,
  quickLinks,
}: {
  data: DashboardData;
  quickLinks: DashboardQuickLink[];
}): DashboardWidgetConfig[] {
  return [
    {
      id: "kpi-cards",
      sectionId: "summary",
      order: 10,
      className: "xl:col-span-12",
      content: <DashboardSummaryCards data={data} variant="staff" />,
    },
    {
      id: "quick-actions",
      sectionId: "summary",
      order: 20,
      className: "xl:col-span-12",
      content: <DashboardQuickLinks links={quickLinks} />,
    },
    {
      id: "low-stock",
      sectionId: "operations",
      order: 10,
      className: "xl:col-span-7",
      content: <DashboardLowStockSection products={data.lowStockProducts} variant="staff" />,
    },
    {
      id: "access",
      sectionId: "operations",
      order: 20,
      className: "xl:col-span-5",
      content: <DashboardStaffAccessSection accessLogs={data.recentAccessLogs} />,
    },
  ];
}
