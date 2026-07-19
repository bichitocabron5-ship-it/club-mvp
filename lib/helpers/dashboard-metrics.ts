import { formatLocalDay } from "@/lib/cash-move";
import { roundCurrency } from "@/lib/sales";

export function getDashboardSaleRevenue(sale: {
  finalAmount: number | null;
  totalAmount: number;
}) {
  return Number(sale.finalAmount ?? sale.totalAmount ?? 0);
}

export function hasEstimatedMargin(unitCost: number, qty: number) {
  return qty > 0 && Number(unitCost || 0) <= 0;
}

export function getDashboardMarginPercent(profit: number, revenue: number) {
  if (revenue <= 0) {
    return 0;
  }

  return roundCurrency((profit / revenue) * 100);
}

export function buildDashboardDayKeys(day: string, count: number) {
  const keys: string[] = [];
  const endDate = new Date(`${day}T00:00:00`);

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const current = new Date(endDate);
    current.setDate(current.getDate() - offset);
    keys.push(formatLocalDay(current));
  }

  return keys;
}
