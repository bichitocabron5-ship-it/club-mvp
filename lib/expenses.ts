import type { Prisma } from "@prisma/client";

import { formatLocalDay } from "@/lib/cash-move";
import { isClosureOpen } from "@/lib/day-closure";

export const CLOSED_EXPENSE_DAY_ERROR =
  "No se puede modificar un gasto de un día cerrado.";

export const PURCHASE_MANAGED_EXPENSE_ERROR =
  "Este gasto procede de compras y debe corregirse desde compras.";

export class ExpenseMutationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ExpenseMutationError";
    this.status = status;
  }
}

type ExpenseDayInput = {
  createdAt: Date;
};

type ExpenseLabelInput = {
  id: number;
  category: string;
  description: string;
};

type ExpensePurchaseInput = {
  category: string;
  description: string;
};

type CashMoveDayInput = {
  day: string | null;
} | null;

type DayClosureReader = Pick<Prisma.TransactionClient, "dayClosure">;

export function getExpenseMutationDay(
  expense: ExpenseDayInput,
  cashMove?: CashMoveDayInput
) {
  return cashMove?.day || formatLocalDay(expense.createdAt);
}

export async function assertExpenseDayIsOpen(
  db: DayClosureReader,
  day: string
) {
  const closure = await db.dayClosure.findUnique({
    where: { day },
    select: {
      reopenedAt: true,
    },
  });

  if (isClosureOpen(closure)) {
    throw new ExpenseMutationError(CLOSED_EXPENSE_DAY_ERROR);
  }
}

export function isPurchaseManagedExpense(expense: ExpensePurchaseInput) {
  const category = expense.category.trim().toUpperCase();
  const description = expense.description.trim().toLowerCase();

  return (
    category === "PROVEEDOR" &&
    (description.startsWith("pago compra proveedor ") ||
      description.startsWith("pago deuda proveedor "))
  );
}

export function assertExpenseIsEditable(expense: {
  cancelledAt: Date | null;
}) {
  if (expense.cancelledAt) {
    throw new ExpenseMutationError("El gasto ya está anulado.");
  }
}

export function assertExpenseIsNotPurchaseManaged(
  expense: ExpensePurchaseInput
) {
  if (isPurchaseManagedExpense(expense)) {
    throw new ExpenseMutationError(PURCHASE_MANAGED_EXPENSE_ERROR);
  }
}

export function buildExpenseCashNote(expense: ExpenseLabelInput) {
  return `${expense.category}: ${expense.description}`;
}

export function buildExpenseCancelCashNote(expense: ExpenseLabelInput) {
  return `Anulación gasto #${expense.id}: ${buildExpenseCashNote(expense)}`;
}
