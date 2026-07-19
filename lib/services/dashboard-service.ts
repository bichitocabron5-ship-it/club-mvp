import { getDayClosureStatus } from "@/lib/day-closure";
import type { DashboardServiceInputDto } from "@/lib/dtos/dashboard";
import {
  getDailyFinance,
  getDashboardSalesSummary,
  getLowStockProducts,
  getRecentDashboardSales,
  getStockSummary,
  getTopMembersToday,
  getTopProductsToday,
  normalizeDashboardSales,
} from "@/lib/services/dashboard-aggregations";
import { buildDashboardPendingAlerts } from "@/lib/services/dashboard-alerts";
import { getDashboardRecords } from "@/lib/services/dashboard-queries";
import {
  serializeDashboardAccessLog,
  serializeDashboardAuditLog,
} from "@/lib/serializers/dashboard-serializers";
import { getTodayRange, roundCurrency } from "@/lib/sales";
import type { DashboardData } from "@/lib/types";
import { buildDashboardDayKeys } from "@/lib/helpers/dashboard-metrics";

export async function getDashboardData({
  role,
}: DashboardServiceInputDto): Promise<DashboardData> {
  const isAdmin = role === "ADMIN";
  const { start, end, day } = getTodayRange();
  const sevenDayKeys = buildDashboardDayKeys(day, 7);
  const sevenDayStart = new Date(start);
  sevenDayStart.setDate(sevenDayStart.getDate() - 6);

  const records = await getDashboardRecords({
    day,
    start,
    end,
    isAdmin,
    sevenDayStart,
    sevenDayKeys,
  });

  const sales = normalizeDashboardSales(records.sales);
  const lowStockProducts = getLowStockProducts(records.products);
  const salesSummary = getDashboardSalesSummary(sales);
  const dayClosureStatus = getDayClosureStatus(records.dayClosure);
  const currentInsideCount = records.members.filter(
    (member) => member.accessLogs[0]?.type === "IN"
  ).length;
  const activeMembersToday = new Set(
    records.accessInToday.map((log) => log.memberId)
  ).size;

  return {
    role,
    generatedAt: new Date().toISOString(),
    summary: {
      salesTodayTotal: salesSummary.salesTodayTotal,
      salesTodayCount: sales.length,
      profitToday: salesSummary.profitToday,
      marginPercent: salesSummary.marginPercent,
      marginIsEstimated: salesSummary.marginIsEstimated,
      discountsTodayTotal: salesSummary.discountsTodayTotal,
      expensesTodayTotal: records.dayClosureSummary.expensesTotal,
      activeMembersToday,
      currentInsideCount,
      lowStockProductsCount: lowStockProducts.length,
    },
    cash: isAdmin
      ? {
          salesTodayTotal: salesSummary.salesTodayTotal,
          salesTodayCount: sales.length,
          profitToday: salesSummary.profitToday,
          marginPercent: salesSummary.marginPercent,
          marginIsEstimated: salesSummary.marginIsEstimated,
          discountsTodayTotal: salesSummary.discountsTodayTotal,
          expensesTodayTotal: records.dayClosureSummary.expensesTotal,
          cashExpectedToday: records.dayClosureSummary.expectedCash,
          cashBalanceToday: records.dayClosureSummary.balance,
          dayClosureStatus,
          dayClosureDifference:
            records.dayClosure &&
            dayClosureStatus !== "OPEN" &&
            dayClosureStatus !== "PENDING"
              ? roundCurrency(Number(records.dayClosure.difference))
              : null,
        }
      : null,
    inventory: {
      openInventoryCountsCount:
        records.dayClosureSummary.inventoryCountsOpenCount,
      confirmedInventoryCountsToday:
        records.dayClosureSummary.inventoryCountsConfirmedCount,
    },
    topProductsToday: getTopProductsToday(sales, isAdmin),
    topMembersToday: getTopMembersToday(sales, isAdmin),
    recentSales: getRecentDashboardSales(sales, isAdmin),
    dailyFinance: getDailyFinance(
      isAdmin,
      sevenDayKeys,
      records.sevenDaySales,
      records.sevenDayCashMoves
    ),
    stockSummary: getStockSummary(records.products, isAdmin),
    lowStockProducts,
    recentAuditLogs: records.recentAuditLogs.map(serializeDashboardAuditLog),
    recentAccessLogs: records.recentAccessLogs.map(serializeDashboardAccessLog),
    pendingAlerts: buildDashboardPendingAlerts({
      day,
      dayClosure: records.dayClosure,
      dayClosureStatus,
      dayClosureSummary: records.dayClosureSummary,
      highDiscountSalesCount: salesSummary.highDiscountSalesCount,
      isAdmin,
      lowStockProductsCount: lowStockProducts.length,
    }),
  };
}
