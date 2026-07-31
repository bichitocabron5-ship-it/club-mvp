import { prisma } from "@/lib/prisma";
import {
  formatLocalDay,
  isCashPaymentMethod,
  isManualCashMoveSource,
  normalizeCashMoveSource,
} from "@/lib/cash-move";
import { roundCurrency } from "@/lib/sales";

export const SIGNIFICANT_CASH_DIFFERENCE = 1;

export type DayClosureStatus = "PENDING" | "OPEN" | "CLOSED" | "REOPENED";

type InventoryCountStatus = "OPEN" | "CONFIRMED" | "CANCELLED" | string;

type DayClosureStatusInput = {
  status?: string | null;
  reopenedAt?: Date | string | null;
} | null | undefined;

type DayClosureUser = {
  id: number;
  name: string;
  email: string;
};

type SummarySale = {
  qty: number;
  totalAmount: number;
  finalAmount: number | null;
  discountAmount: number;
  product: {
    id: number;
    name: string;
    unit: string;
  };
};

export type DayClosureProductWithdrawal = {
  productId: number;
  name: string;
  unit: string;
  qty: number;
  revenue: number;
  salesCount: number;
};

export type DayClosureInventoryOption = {
  id: number;
  status: InventoryCountStatus;
  type: string;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  totalItems: number;
  countedItems: number;
  differenceItems: number;
};

export type DayClosureSummary = {
  day: string;
  closureStatus: DayClosureStatus;
  openingCash: number;
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
  productsMostWithdrawn: DayClosureProductWithdrawal[];
  inventoryCounts: DayClosureInventoryOption[];
  inventoryCountsOpenCount: number;
  inventoryCountsConfirmedCount: number;
};

export type DailyClosureReport = {
  day: string;
  generatedAt: string;
  status: DayClosureStatus;
  summary: DayClosureSummary;
  closure: {
    id: number;
    day: string;
    status: DayClosureStatus;
    openingCash: number;
    expectedCash: number;
    countedCash: number;
    difference: number;
    salesTotal: number;
    expensesTotal: number;
    manualCashTotal: number;
    discountsTotal: number;
    totalIncome: number;
    totalExpense: number;
    balance: number;
    inventoryCountId: number | null;
    note: string | null;
    openedAt: string | null;
    closedAt: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
    createdAt: string;
    openedByUser: DayClosureUser | null;
    closedByUser: DayClosureUser | null;
    reopenedByUser: DayClosureUser | null;
    inventoryCount: {
      id: number;
      status: string;
      type: string;
      notes: string | null;
      confirmedAt: string | null;
    } | null;
  } | null;
  productsMostWithdrawn: DayClosureProductWithdrawal[];
};

function normalizeDayClosureStatus(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase();

  if (
    normalized === "PENDING" ||
    normalized === "OPEN" ||
    normalized === "CLOSED" ||
    normalized === "REOPENED"
  ) {
    return normalized;
  }

  return null;
}

export function getDayClosureStatus(
  closure: DayClosureStatusInput
): DayClosureStatus {
  if (!closure) {
    return "PENDING";
  }

  const status = normalizeDayClosureStatus(closure.status);

  if (status) {
    return status;
  }

  return closure.reopenedAt ? "REOPENED" : "CLOSED";
}

export function isClosureClosed(closure: DayClosureStatusInput) {
  return getDayClosureStatus(closure) === "CLOSED";
}

export function isClosureOpen(closure: DayClosureStatusInput) {
  // Backwards-compatible name used by existing mutation guards.
  return isClosureClosed(closure);
}

export function isValidDayKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getDayRange(dayKey = formatLocalDay()) {
  if (!isValidDayKey(dayKey)) {
    throw new Error("Dia invalido");
  }

  const start = new Date(`${dayKey}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    throw new Error("Dia invalido");
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end, day: dayKey };
}

function getSaleRevenue(sale: {
  finalAmount: number | null;
  totalAmount: number;
}) {
  return Number(sale.finalAmount ?? sale.totalAmount ?? 0);
}

function buildProductsMostWithdrawn(
  sales: SummarySale[],
  take = 5
): DayClosureProductWithdrawal[] {
  return Array.from(
    sales.reduce((map, sale) => {
      const current = map.get(sale.product.id) ?? {
        productId: sale.product.id,
        name: sale.product.name,
        unit: sale.product.unit,
        qty: 0,
        revenue: 0,
        salesCount: 0,
      };

      current.qty += Number(sale.qty);
      current.revenue += getSaleRevenue(sale);
      current.salesCount += 1;
      map.set(sale.product.id, current);

      return map;
    }, new Map<number, DayClosureProductWithdrawal>())
  )
    .map(([, item]) => ({
      ...item,
      qty: roundCurrency(item.qty),
      revenue: roundCurrency(item.revenue),
    }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, take);
}

function serializeInventoryCounts(
  inventoryCounts: Array<{
    id: number;
    status: string;
    type: string;
    notes: string | null;
    createdAt: Date;
    confirmedAt: Date | null;
    items: Array<{
      countedQty: number | null;
      differenceQty: number | null;
    }>;
  }>
) {
  return inventoryCounts.map((count) => {
    const countedItems = count.items.filter((item) => item.countedQty !== null);

    return {
      id: count.id,
      status: count.status,
      type: count.type,
      notes: count.notes,
      createdAt: count.createdAt.toISOString(),
      confirmedAt: count.confirmedAt?.toISOString() ?? null,
      totalItems: count.items.length,
      countedItems: countedItems.length,
      differenceItems: countedItems.filter(
        (item) => Number(item.differenceQty || 0) !== 0
      ).length,
    };
  });
}

export async function buildDayClosureSummary(
  dayKey = formatLocalDay()
): Promise<DayClosureSummary> {
  const { start, end, day } = getDayRange(dayKey);

  const closure = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
    select: {
      status: true,
      openingCash: true,
      reopenedAt: true,
    },
  });
  const sales = await prisma.sale.findMany({
    where: {
      cancelledAt: null,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    select: {
      qty: true,
      totalAmount: true,
      finalAmount: true,
      discountAmount: true,
      product: {
        select: {
          id: true,
          name: true,
          unit: true,
        },
      },
    },
  });
  const expenses = await prisma.expense.findMany({
    where: {
      cancelledAt: null,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    select: {
      amount: true,
      paidMethod: true,
    },
  });
  const cashMoves = await prisma.cashMove.findMany({
    where: {
      OR: [
        {
          day,
        },
        {
          day: null,
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      ],
    },
    select: {
      type: true,
      amount: true,
      note: true,
      source: true,
      paymentMethod: true,
    },
  });
  const inventoryCounts = await prisma.inventoryCount.findMany({
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
      items: {
        select: {
          countedQty: true,
          differenceQty: true,
        },
      },
    },
  });

  const typedSales: SummarySale[] = sales.map((sale) => ({
    qty: Number(sale.qty),
    totalAmount: Number(sale.totalAmount),
    finalAmount: sale.finalAmount === null ? null : Number(sale.finalAmount),
    discountAmount: Number(sale.discountAmount || 0),
    product: sale.product,
  }));
  const openingCash = roundCurrency(Number(closure?.openingCash || 0));

  const salesTotal = roundCurrency(
    typedSales.reduce((acc, sale) => acc + getSaleRevenue(sale), 0)
  );
  const discountsTotal = roundCurrency(
    typedSales.reduce((acc, sale) => acc + Number(sale.discountAmount || 0), 0)
  );
  const expensesTotal = roundCurrency(
    expenses
      .filter((expense) => isCashPaymentMethod(expense.paidMethod))
      .reduce((acc, expense) => acc + Number(expense.amount), 0)
  );
  const totalIncome = roundCurrency(
    cashMoves
      .filter((move) => move.type === "income" && isCashPaymentMethod(move.paymentMethod))
      .reduce((acc, move) => acc + Number(move.amount), 0)
  );
  const totalExpense = roundCurrency(
    cashMoves
      .filter((move) => move.type === "expense" && isCashPaymentMethod(move.paymentMethod))
      .reduce((acc, move) => acc + Number(move.amount), 0)
  );
  const balance = roundCurrency(totalIncome - totalExpense);
  const manualCashTotal = roundCurrency(
    cashMoves
      .filter((move) => isCashPaymentMethod(move.paymentMethod))
      .filter((move) =>
        isManualCashMoveSource(
          normalizeCashMoveSource(move.source, {
            type: move.type,
            note: move.note,
          })
        )
      )
      .reduce((acc, move) => {
        const signedAmount =
          move.type === "income" ? Number(move.amount) : -Number(move.amount);

        return acc + signedAmount;
      }, 0)
  );
  const expectedCash = roundCurrency(
    openingCash + salesTotal - expensesTotal + manualCashTotal
  );
  const serializedInventoryCounts = serializeInventoryCounts(inventoryCounts);

  return {
    day,
    closureStatus: getDayClosureStatus(closure),
    openingCash,
    salesTotal,
    expensesTotal,
    manualCashTotal,
    discountsTotal,
    expectedCash,
    totalIncome,
    totalExpense,
    balance,
    salesCount: typedSales.length,
    cashMovesCount: cashMoves.length,
    productsMostWithdrawn: buildProductsMostWithdrawn(typedSales),
    inventoryCounts: serializedInventoryCounts,
    inventoryCountsOpenCount: serializedInventoryCounts.filter(
      (count) => count.status === "OPEN"
    ).length,
    inventoryCountsConfirmedCount: serializedInventoryCounts.filter(
      (count) => count.status === "CONFIRMED"
    ).length,
  };
}

export async function buildTodayDayClosureSummary() {
  return buildDayClosureSummary();
}

export async function buildDailyClosureReport(
  dayKey = formatLocalDay()
): Promise<DailyClosureReport> {
  const { day } = getDayRange(dayKey);
  const summary = await buildDayClosureSummary(day);
  const closure = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
    include: {
      openedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      closedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reopenedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      inventoryCount: {
        select: {
          id: true,
          status: true,
          type: true,
          notes: true,
          confirmedAt: true,
        },
      },
    },
  });

  const status = getDayClosureStatus(closure);

  return {
    day,
    generatedAt: new Date().toISOString(),
    status,
    summary,
    closure: closure
      ? {
          id: closure.id,
          day: closure.day,
          status,
          openingCash: Number(closure.openingCash),
          expectedCash: Number(closure.expectedCash),
          countedCash: Number(closure.countedCash),
          difference: Number(closure.difference),
          salesTotal: Number(closure.salesTotal),
          expensesTotal: Number(closure.expensesTotal),
          manualCashTotal: Number(closure.manualCashTotal),
          discountsTotal: Number(closure.discountsTotal),
          totalIncome: Number(closure.totalIncome),
          totalExpense: Number(closure.totalExpense),
          balance: Number(closure.balance),
          inventoryCountId: closure.inventoryCountId,
          note: closure.note,
          openedAt: closure.openedAt?.toISOString() ?? null,
          closedAt: closure.closedAt?.toISOString() ?? null,
          reopenedAt: closure.reopenedAt?.toISOString() ?? null,
          reopenReason: closure.reopenReason,
          createdAt: closure.createdAt.toISOString(),
          openedByUser: closure.openedByUser,
          closedByUser: closure.closedByUser,
          reopenedByUser: closure.reopenedByUser,
          inventoryCount: closure.inventoryCount
            ? {
                ...closure.inventoryCount,
                confirmedAt:
                  closure.inventoryCount.confirmedAt?.toISOString() ?? null,
              }
            : null,
        }
      : null,
    productsMostWithdrawn: summary.productsMostWithdrawn,
  };
}

function escapeCsvValue(value: string | number | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }

  return raw;
}

export function buildDailyClosureReportCsv(report: DailyClosureReport) {
  const products = report.productsMostWithdrawn
    .map(
      (product) =>
        `${product.name} ${product.qty.toFixed(2)} ${product.unit} (${product.salesCount})`
    )
    .join(" | ");
  const row = {
    fecha: report.day,
    estado: report.status,
    ventas_totales: report.summary.salesTotal,
    gastos: report.summary.expensesTotal,
    caja_inicial: report.summary.openingCash,
    caja_esperada: report.summary.expectedCash,
    caja_contada: report.closure?.countedCash ?? "",
    diferencia: report.closure?.difference ?? "",
    tickets: report.summary.salesCount,
    descuentos: report.summary.discountsTotal,
    ingresos_caja: report.summary.totalIncome,
    gastos_caja: report.summary.totalExpense,
    movimientos_manuales: report.summary.manualCashTotal,
    responsable_cierre:
      report.closure?.closedByUser?.name ??
      report.closure?.closedByUser?.email ??
      "",
    conteo_vinculado: report.closure?.inventoryCountId ?? "",
    productos_mas_retirados: products,
  };
  const headers = Object.keys(row);
  const values = Object.values(row);

  return [
    headers.map(escapeCsvValue).join(","),
    values.map(escapeCsvValue).join(","),
  ].join("\n");
}
