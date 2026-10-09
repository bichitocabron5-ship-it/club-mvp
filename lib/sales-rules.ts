import type { ProductUnit } from "@/lib/types";
import { formatLocalDay } from "@/lib/cash-move";

type ProductWithUnit = {
  unit: string;
};

type SaleWithProductUnit = {
  qty: number;
  product: ProductWithUnit;
};

export function normalizeUnit(unit: string): ProductUnit | null {
  const normalized = unit.trim().toUpperCase();

  if (normalized === "G" || normalized === "UD") {
    return normalized;
  }

  return null;
}

// Preserve the sales engine's server-local calendar month, not a UTC window.
export function getMonthRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(1);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return { start, end };
}

export function getMonthlyGramTotal(sales: SaleWithProductUnit[]) {
  return sales.reduce((total, sale) => {
    return normalizeUnit(sale.product.unit) === "G" ? total + sale.qty : total;
  }, 0);
}

export function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const day = formatLocalDay(start);

  return { start, end, day };
}

export function getDailyTotals(sales: SaleWithProductUnit[]) {
  let grams = 0;
  let units = 0;

  for (const sale of sales) {
    const unit = normalizeUnit(sale.product.unit);

    if (unit === "G") grams += sale.qty;
    if (unit === "UD") units += sale.qty;
  }

  return { grams, units };
}
