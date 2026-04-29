export const DAILY_LIMIT_G = 10;
export const DAILY_LIMIT_UD = 15;

export type ProductUnit = "G" | "UD";

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

  const day = start.toISOString().slice(0, 10);

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
