import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";

type InventoryCountStatus = "OPEN" | "CONFIRMED" | "CANCELLED" | string;

export type DayClosureInventoryOption = {
  id: number;
  status: InventoryCountStatus;
  type: string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type DayClosureSummary = {
  day: string;
  salesTotal: number;
  expensesTotal: number;
  manualCashTotal: number;
  discountsTotal: number;
  expectedCash: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  salesCount: number;
  cashMovesCount: number;
  inventoryCounts: DayClosureInventoryOption[];
  inventoryCountsOpenCount: number;
  inventoryCountsConfirmedCount: number;
};

export function isClosureOpen(closure: { reopenedAt: Date | null } | null | undefined) {
  return !!closure && !closure.reopenedAt;
}

export async function buildTodayDayClosureSummary(): Promise<DayClosureSummary> {
  const { start, end, day } = getTodayRange();

  const [sales, expenses, cashMoves, inventoryCounts] = await Promise.all([
    prisma.sale.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        totalAmount: true,
        discountAmount: true,
      },
    }),
    prisma.expense.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        amount: true,
      },
    }),
    prisma.cashMove.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        type: true,
        amount: true,
      },
    }),
    prisma.inventoryCount.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
        status: {
          in: ["OPEN", "CONFIRMED"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        type: true,
        notes: true,
        createdAt: true,
        confirmedAt: true,
      },
    }),
  ]);

  const salesTotal = roundCurrency(
    sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
  );
  const discountsTotal = roundCurrency(
    sales.reduce((acc, sale) => acc + Number(sale.discountAmount || 0), 0)
  );
  const expensesTotal = roundCurrency(
    expenses.reduce((acc, expense) => acc + Number(expense.amount), 0)
  );
  const totalIncome = roundCurrency(
    cashMoves
      .filter((move) => move.type === "income")
      .reduce((acc, move) => acc + Number(move.amount), 0)
  );
  const totalExpense = roundCurrency(
    cashMoves
      .filter((move) => move.type === "expense")
      .reduce((acc, move) => acc + Number(move.amount), 0)
  );
  const balance = roundCurrency(totalIncome - totalExpense);
  const manualCashTotal = roundCurrency(balance - salesTotal + expensesTotal);
  const expectedCash = roundCurrency(salesTotal - expensesTotal + manualCashTotal);

  return {
    day,
    salesTotal,
    expensesTotal,
    manualCashTotal,
    discountsTotal,
    expectedCash,
    totalIncome,
    totalExpense,
    balance,
    salesCount: sales.length,
    cashMovesCount: cashMoves.length,
    inventoryCounts: inventoryCounts.map((count) => ({
      id: count.id,
      status: count.status,
      type: count.type,
      notes: count.notes,
      createdAt: count.createdAt.toISOString(),
      confirmedAt: count.confirmedAt?.toISOString() ?? null,
    })),
    inventoryCountsOpenCount: inventoryCounts.filter(
      (count) => count.status === "OPEN"
    ).length,
    inventoryCountsConfirmedCount: inventoryCounts.filter(
      (count) => count.status === "CONFIRMED"
    ).length,
  };
}
