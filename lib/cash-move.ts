export const CASH_MOVE_SOURCES = [
  "SALE",
  "EXPENSE",
  "EXPENSE_CANCELLED",
  "PURCHASE_PAYMENT",
  "MANUAL",
  "ADJUSTMENT",
  "OTHER",
] as const;

export type CashMoveSource = (typeof CASH_MOVE_SOURCES)[number];

export const CASH_MOVE_PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "TRANSFER",
  "OTHER",
] as const;

export type CashMovePaymentMethod = (typeof CASH_MOVE_PAYMENT_METHODS)[number];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function normalizeCashMoveSource(
  source: string | null | undefined,
  fallback?: {
    type?: string | null;
    note?: string | null;
  }
): CashMoveSource {
  const normalized = source?.trim().toUpperCase();

  if (normalized && CASH_MOVE_SOURCES.includes(normalized as CashMoveSource)) {
    return normalized as CashMoveSource;
  }

  const type = fallback?.type?.trim().toLowerCase();
  const note = fallback?.note?.trim().toLowerCase() || "";

  if (
    type === "expense" &&
    (note.includes("pago compra proveedor") || note.includes("pago deuda proveedor"))
  ) {
    return "PURCHASE_PAYMENT";
  }

  if (type === "expense") {
    return "EXPENSE";
  }

  if (type === "income" && note.includes("retirada")) {
    return "SALE";
  }

  return "OTHER";
}

export function normalizeCashMovePaymentMethod(
  paymentMethod: string | null | undefined
): CashMovePaymentMethod {
  const normalized = paymentMethod?.trim().toUpperCase();

  if (
    normalized &&
    CASH_MOVE_PAYMENT_METHODS.includes(normalized as CashMovePaymentMethod)
  ) {
    return normalized as CashMovePaymentMethod;
  }

  return "CASH";
}

export function isCashPaymentMethod(paymentMethod: string | null | undefined) {
  return normalizeCashMovePaymentMethod(paymentMethod) === "CASH";
}

export function isManualCashMoveSource(source: string | null | undefined) {
  const normalized = normalizeCashMoveSource(source);
  return (
    normalized === "MANUAL" ||
    normalized === "ADJUSTMENT" ||
    normalized === "OTHER"
  );
}
