import { PRODUCT_HASH_TYPES } from "@/lib/types";
import type {
  ProductCategory,
  ProductHashType,
  ProductSummary,
} from "@/lib/types";

export const SALES_PRODUCT_CATEGORIES = [
  { value: "ALL", label: "Todo" },
  { value: "CANNABIS", label: "Cannabis" },
  { value: "SATIVA", label: "Sativa" },
  { value: "INDICA", label: "Índica" },
  { value: "HYBRID", label: "Híbrida" },
  { value: "CBD", label: "CBD" },
  { value: "RESIN", label: "Resina" },
  { value: "HASH", label: "Hash" },
  { value: "JOINT", label: "Joints" },
  { value: "DRINK", label: "Bebidas" },
  { value: "FOOD", label: "Comida" },
  { value: "MERCH", label: "Merch" },
] as const satisfies ReadonlyArray<{
  value: "ALL" | ProductCategory;
  label: string;
}>;

const hashTypeLabelMap = new Map(
  PRODUCT_HASH_TYPES.map((hashType) => [hashType.value, hashType.label])
);

const categoryLabelMap = new Map(
  SALES_PRODUCT_CATEGORIES.map((category) => [category.value, category.label])
);

export const QTY_DECIMALS_G = 3;
export const QTY_EPSILON = 0.000001;

export function getSalesHashTypeLabel(hashType: ProductHashType) {
  return hashTypeLabelMap.get(hashType) ?? hashType;
}

export function getSalesCategoryLabel(category: ProductCategory | "ALL") {
  return categoryLabelMap.get(category) ?? category;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeDiscountPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export function roundQty(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return Math.round(value);
  }

  const factor = 10 ** QTY_DECIMALS_G;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatQtyInput(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return String(Math.round(value));
  }

  return String(roundQty(value, unit));
}

export function formatQtyLabel(value: number, unit: ProductSummary["unit"]) {
  if (unit === "UD") {
    return `${Math.round(value)} ud`;
  }

  return `${roundQty(value, unit).toFixed(QTY_DECIMALS_G)} g`;
}

export function formatCurrencyLabel(value: number) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

export function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parsePositiveNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
