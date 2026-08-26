import {
  normalizeDiscountPercent,
  parsePositiveNumber,
  QTY_EPSILON,
  roundCurrency,
  roundQty,
} from "@/lib/helpers/sales-formatters";
import type { MemberSummary, ProductSummary } from "@/lib/types";

export type TodayTotals = {
  grams: number;
  units: number;
  monthlyGrams: number;
  limits: {
    dailyLimitG: number;
    dailyLimitUd: number;
    monthlyLimitG: number | null;
  };
};

export type CartInputMode = "QTY" | "AMOUNT";

export type CartItem = {
  productId: number;
  inputMode: CartInputMode;
  qtyInput: string;
  amountInput: string;
};

export type CartLine = CartItem & {
  product: ProductSummary | undefined;
  price: number;
  stock: number;
  qty: number;
  originalAmount: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  conversionError: string;
};

export type SalesCartTotals = {
  cartOriginalTotal: number;
  cartDiscountTotal: number;
  cartTotal: number;
  cartG: number;
  cartUD: number;
  gramsAfter: number;
  unitsAfter: number;
  monthGramsAfter: number;
  overGrams: boolean;
  overUnits: boolean;
  overMonthly: boolean;
  stockProblems: CartLine[];
  conversionProblems: CartLine[];
};

export type RecentSale = {
  id: number;
  qty: number;
  totalAmount: number;
  finalAmount: number | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  canCancel: boolean;
  member: {
    fullName: string;
  };
  product: {
    name: string;
    unit: ProductSummary["unit"] | string;
  };
};

export type RecentSalesResponse = {
  role: string;
  day: string;
  dayClosed: boolean;
  sales: RecentSale[];
};

export type MemberRecentSale = {
  id: number;
  cancelledAt: string | null;
  product: {
    name: string;
  };
};

export type MemberRecentSalesResponse = {
  sales: MemberRecentSale[];
};

export type AddProductOptions = {
  focusInput?: boolean;
};

export type MemberOperationalStatus = {
  member: MemberSummary & {
    active: boolean;
    expiresAt: string | null;
  };
  hasContract: boolean;
  contract: {
    monthlyLimitG: number | null;
  } | null;
  expired: boolean;
  canWithdraw: boolean;
  reasons: {
    inactive: boolean;
    noContract: boolean;
    expired: boolean;
  };
};

export const emptySalesToday: TodayTotals = {
  grams: 0,
  units: 0,
  monthlyGrams: 0,
  limits: {
    dailyLimitG: 10,
    dailyLimitUd: 15,
    monthlyLimitG: null,
  },
};

export function buildSalesCartLines({
  cart,
  products,
  discountPercent,
}: {
  cart: CartItem[];
  products: ProductSummary[];
  discountPercent: number;
}) {
  const normalizedDiscountPercent = normalizeDiscountPercent(discountPercent);

  return cart.map((item): CartLine => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const price = product ? Number(product.price) : 0;
    const stock = product ? Number(product.stock) : 0;
    const parsedQtyInput = parsePositiveNumber(item.qtyInput);
    const parsedAmountInput = parsePositiveNumber(item.amountInput);
    let qty = 0;
    let originalAmount = 0;
    let discountAmount = 0;
    let finalAmount = 0;
    let conversionError = "";

    if (!product) {
      conversionError = "Producto no encontrado.";
    } else if (item.inputMode === "QTY") {
      if (parsedQtyInput === null) {
        conversionError = "Introduce una cantidad mayor que 0.";
      } else if (product.unit === "UD" && !Number.isInteger(parsedQtyInput)) {
        conversionError = "Este producto se vende por unidades enteras.";
      } else {
        qty = roundQty(parsedQtyInput, product.unit);

        if (qty <= 0) {
          conversionError = "La cantidad final debe ser mayor que 0.";
        } else {
          const pricing = getPricingEstimate(qty, price, normalizedDiscountPercent);
          originalAmount = pricing.originalAmount;
          discountAmount = pricing.discountAmount;
          finalAmount = pricing.finalAmount;
        }
      }
    } else if (parsedAmountInput === null) {
      conversionError = "Introduce un importe mayor que 0.";
    } else if (price <= 0) {
      conversionError = "El producto no tiene un precio válido.";
    } else if (normalizedDiscountPercent >= 100) {
      conversionError = "No se puede calcular por importe con descuento del 100 %.";
    } else if (product.unit === "UD") {
      const effectivePrice = price * (1 - normalizedDiscountPercent / 100);
      const rawQty = parsedAmountInput / effectivePrice;
      const roundedQty = Math.round(rawQty);

      if (Math.abs(rawQty - roundedQty) > QTY_EPSILON) {
        conversionError =
          "Este producto se vende por unidades. Introduce un importe que corresponda a unidades completas.";
      } else if (roundedQty <= 0) {
        conversionError = "La cantidad final debe ser mayor que 0.";
      } else {
        qty = roundedQty;
        const pricing = getPricingEstimate(qty, price, normalizedDiscountPercent);
        originalAmount = pricing.originalAmount;
        discountAmount = pricing.discountAmount;
        finalAmount = pricing.finalAmount;
      }
    } else {
      const effectivePrice = price * (1 - normalizedDiscountPercent / 100);
      const rawQty = parsedAmountInput / effectivePrice;
      qty = findClosestGramQty(
        rawQty,
        price,
        normalizedDiscountPercent,
        parsedAmountInput
      );

      if (qty <= 0) {
        conversionError = "La cantidad final debe ser mayor que 0.";
      } else {
        const pricing = getPricingEstimate(qty, price, normalizedDiscountPercent);
        originalAmount = pricing.originalAmount;
        discountAmount = pricing.discountAmount;
        finalAmount = pricing.finalAmount;
      }
    }

    return {
      ...item,
      product,
      price,
      stock,
      qty,
      originalAmount,
      discountPercent: normalizedDiscountPercent,
      discountAmount,
      finalAmount,
      conversionError,
    };
  });
}

export function getSalesCartTotals(
  cartLines: CartLine[],
  visibleToday: TodayTotals
): SalesCartTotals {
  const cartOriginalTotal = cartLines.reduce(
    (acc, line) => acc + line.originalAmount,
    0
  );
  const cartDiscountTotal = cartLines.reduce(
    (acc, line) => acc + line.discountAmount,
    0
  );
  const cartTotal = cartLines.reduce((acc, line) => acc + line.finalAmount, 0);

  const cartG = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "G") return acc + line.qty;
    return acc;
  }, 0);

  const cartUD = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "UD") return acc + line.qty;
    return acc;
  }, 0);

  const gramsAfter = visibleToday.grams + cartG;
  const unitsAfter = visibleToday.units + cartUD;
  const monthGramsAfter = visibleToday.monthlyGrams + cartG;
  const overGrams = gramsAfter > visibleToday.limits.dailyLimitG;
  const overUnits = unitsAfter > visibleToday.limits.dailyLimitUd;
  const overMonthly =
    visibleToday.limits.monthlyLimitG !== null &&
    monthGramsAfter > visibleToday.limits.monthlyLimitG;

  const stockProblems = cartLines.filter((line) => {
    if (!line.product) return true;
    return line.qty > line.stock;
  });

  const conversionProblems = cartLines.filter((line) => line.conversionError);

  return {
    cartOriginalTotal,
    cartDiscountTotal,
    cartTotal,
    cartG,
    cartUD,
    gramsAfter,
    unitsAfter,
    monthGramsAfter,
    overGrams,
    overUnits,
    overMonthly,
    stockProblems,
    conversionProblems,
  };
}

export function getPricingEstimate(
  qty: number,
  price: number,
  discountPercent: number
) {
  const originalAmount = roundCurrency(qty * price);
  const discountAmount = roundCurrency(originalAmount * (discountPercent / 100));
  const finalAmount = roundCurrency(originalAmount - discountAmount);

  return {
    originalAmount,
    discountAmount,
    finalAmount,
  };
}

export function findClosestGramQty(
  rawQty: number,
  price: number,
  discountPercent: number,
  targetFinalAmount: number
) {
  const rounded = roundQty(rawQty, "G");
  const candidates = [rounded - 0.001, rounded, rounded + 0.001]
    .filter((candidate) => candidate > 0)
    .map((candidate) => roundQty(candidate, "G"));

  let bestQty = candidates[0] ?? rounded;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateFinalAmount = getPricingEstimate(
      candidate,
      price,
      discountPercent
    ).finalAmount;
    const diff = Math.abs(candidateFinalAmount - targetFinalAmount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestQty = candidate;
    }
  }

  return bestQty;
}
