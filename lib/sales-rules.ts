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
