import {
  formatLocalDay,
  normalizeCashMovePaymentMethod,
  normalizeCashMoveSource,
} from "@/lib/cash-move";
import type {
  DashboardComparisonCashMoveRecord,
  DashboardComparisonMetricDto,
  DashboardComparisonsDto,
  DashboardMemberAggregateDto,
  DashboardProductAggregateDto,
  DashboardProductRecord,
  DashboardRawSaleRecord,
  DashboardSaleRecord,
  DashboardSevenDayCashMoveRecord,
  DashboardSevenDaySaleRecord,
} from "@/lib/dtos/dashboard";
import {
  getDashboardMarginPercent,
  getDashboardSaleRevenue,
  hasEstimatedMargin,
} from "@/lib/helpers/dashboard-metrics";
import { roundCurrency } from "@/lib/sales";
import {
  serializeDashboardProduct,
  serializeDashboardSale,
} from "@/lib/serializers/dashboard-serializers";
import type {
  DashboardDailyFinance,
  DashboardMemberStat,
  DashboardProductStat,
  DashboardSale,
  DashboardStockSummary,
  ProductSummary,
} from "@/lib/types";

const HIGH_DISCOUNT_PERCENT_THRESHOLD = 20;
const HIGH_DISCOUNT_AMOUNT_THRESHOLD = 20;

type DashboardSalesMetrics = {
  total: number;
  count: number;
  averageTicket: number;
};

type DashboardRevenueSale = {
  totalAmount: number;
  finalAmount: number | null;
};

type DashboardPaymentTotals = {
  cashTotal: number;
  cardTotal: number;
};

type DashboardComparisonsInput = {
  currentSalesMetrics: DashboardSalesMetrics;
  previousDaySales: DashboardRawSaleRecord[];
  sevenDaySales: DashboardSevenDaySaleRecord[];
  isAdmin: boolean;
  currentDay: string;
  previousDay: string;
  cashMoves: DashboardComparisonCashMoveRecord[];
};

export function normalizeDashboardSales(
  sales: DashboardRawSaleRecord[]
): DashboardSaleRecord[] {
  return sales.map((sale) => ({
    id: sale.id,
    memberId: sale.memberId,
    qty: Number(sale.qty),
    totalAmount: Number(sale.totalAmount),
    finalAmount: sale.finalAmount === null ? null : Number(sale.finalAmount),
    originalAmount:
      sale.originalAmount === null ? null : Number(sale.originalAmount),
    discountAmount: Number(sale.discountAmount || 0),
    discountPercent: Number(sale.discountPercent || 0),
    unitCost: Number(sale.unitCost || 0),
    profit: Number(sale.profit || 0),
    createdAt: sale.createdAt,
    member: sale.member,
    product: sale.product,
  }));
}

export function getLowStockProducts(
  products: DashboardProductRecord[]
): ProductSummary[] {
  return products
    .filter((product) => Number(product.stock) <= Number(product.minStock))
    .slice(0, 10)
    .map(serializeDashboardProduct);
}

function getDashboardSalesMetrics(sales: DashboardRevenueSale[]): DashboardSalesMetrics {
  const total = roundCurrency(
    sales.reduce((acc, sale) => acc + getDashboardSaleRevenue(sale), 0)
  );

  return {
    total,
    count: sales.length,
    averageTicket: sales.length > 0 ? roundCurrency(total / sales.length) : 0,
  };
}

function buildDashboardComparisonMetric(
  current: number,
  previous: number
): DashboardComparisonMetricDto {
  const currentValue = roundCurrency(current);
  const previousValue = roundCurrency(previous);
  const delta = roundCurrency(currentValue - previousValue);

  return {
    current: currentValue,
    previous: previousValue,
    delta,
    deltaPercent:
      previousValue === 0 ? null : roundCurrency((delta / previousValue) * 100),
  };
}

function getPaymentComparisonDay(
  cashMove: DashboardComparisonCashMoveRecord,
  currentDay: string,
  previousDay: string
) {
  const moveDay = cashMove.day || formatLocalDay(cashMove.createdAt);

  if (moveDay === currentDay) {
    return "current" as const;
  }

  if (moveDay === previousDay) {
    return "previous" as const;
  }

  return null;
}

function getDashboardPaymentTotals(
  cashMoves: DashboardComparisonCashMoveRecord[],
  currentDay: string,
  previousDay: string
) {
  const totals: Record<"current" | "previous", DashboardPaymentTotals> = {
    current: {
      cashTotal: 0,
      cardTotal: 0,
    },
    previous: {
      cashTotal: 0,
      cardTotal: 0,
    },
  };

  for (const cashMove of cashMoves) {
    const source = normalizeCashMoveSource(cashMove.source, {
      type: cashMove.type,
      note: cashMove.note,
    });
    const isSaleIncome = cashMove.type === "income" && source === "SALE";
    const isSaleCancellation =
      cashMove.type === "expense" && source === "SALE_CANCELLED";

    if (!isSaleIncome && !isSaleCancellation) {
      continue;
    }

    const comparisonDay = getPaymentComparisonDay(
      cashMove,
      currentDay,
      previousDay
    );

    if (!comparisonDay) {
      continue;
    }

    const amount = Number(cashMove.amount);
    const signedAmount = isSaleIncome ? amount : -amount;
    const paymentMethod = normalizeCashMovePaymentMethod(
      cashMove.paymentMethod
    );

    if (paymentMethod === "CASH") {
      totals[comparisonDay].cashTotal += signedAmount;
    }

    if (paymentMethod === "CARD") {
      totals[comparisonDay].cardTotal += signedAmount;
    }
  }

  return totals;
}

function getPreviousSalesForComparisons({
  isAdmin,
  previousDay,
  previousDaySales,
  sevenDaySales,
}: Pick<
  DashboardComparisonsInput,
  "isAdmin" | "previousDay" | "previousDaySales" | "sevenDaySales"
>): DashboardRevenueSale[] {
  if (isAdmin) {
    return sevenDaySales.filter(
      (sale) => formatLocalDay(sale.createdAt) === previousDay
    );
  }

  return normalizeDashboardSales(previousDaySales);
}

export function getDashboardSalesSummary(sales: DashboardSaleRecord[]) {
  const salesMetrics = getDashboardSalesMetrics(sales);
  const profitToday = roundCurrency(
    sales.reduce((acc, sale) => acc + Number(sale.profit || 0), 0)
  );
  const marginIsEstimated = sales.some((sale) =>
    hasEstimatedMargin(sale.unitCost, sale.qty)
  );

  return {
    salesTodayTotal: salesMetrics.total,
    salesTodayCount: salesMetrics.count,
    averageTicketToday: salesMetrics.averageTicket,
    profitToday,
    marginPercent: getDashboardMarginPercent(profitToday, salesMetrics.total),
    marginIsEstimated,
    discountsTodayTotal: roundCurrency(
      sales.reduce((acc, sale) => acc + Number(sale.discountAmount || 0), 0)
    ),
    highDiscountSalesCount: sales.filter(
      (sale) =>
        Number(sale.discountPercent || 0) >= HIGH_DISCOUNT_PERCENT_THRESHOLD ||
        Number(sale.discountAmount || 0) >= HIGH_DISCOUNT_AMOUNT_THRESHOLD
    ).length,
  };
}

export function getDashboardComparisons({
  currentSalesMetrics,
  previousDaySales,
  sevenDaySales,
  isAdmin,
  currentDay,
  previousDay,
  cashMoves,
}: DashboardComparisonsInput): DashboardComparisonsDto {
  const previousSalesMetrics = getDashboardSalesMetrics(
    getPreviousSalesForComparisons({
      isAdmin,
      previousDay,
      previousDaySales,
      sevenDaySales,
    })
  );
  const paymentTotals = getDashboardPaymentTotals(
    cashMoves,
    currentDay,
    previousDay
  );

  return {
    salesTotal: buildDashboardComparisonMetric(
      currentSalesMetrics.total,
      previousSalesMetrics.total
    ),
    salesCount: buildDashboardComparisonMetric(
      currentSalesMetrics.count,
      previousSalesMetrics.count
    ),
    averageTicket: buildDashboardComparisonMetric(
      currentSalesMetrics.averageTicket,
      previousSalesMetrics.averageTicket
    ),
    cashTotal: buildDashboardComparisonMetric(
      paymentTotals.current.cashTotal,
      paymentTotals.previous.cashTotal
    ),
    cardTotal: buildDashboardComparisonMetric(
      paymentTotals.current.cardTotal,
      paymentTotals.previous.cardTotal
    ),
  };
}

export function getTopProductsToday(
  sales: DashboardSaleRecord[],
  isAdmin: boolean
): DashboardProductStat[] | null {
  if (!isAdmin) {
    return null;
  }

  return Array.from(
    sales.reduce((map, sale) => {
      const key = sale.product.id;
      const current = map.get(key) ?? {
        productId: key,
        name: sale.product.name,
        unit: sale.product.unit,
        qty: 0,
        revenue: 0,
        profit: 0,
        salesCount: 0,
        marginIsEstimated: false,
      };

      current.qty += sale.qty;
      current.revenue += getDashboardSaleRevenue(sale);
      current.profit += sale.profit;
      current.salesCount += 1;
      current.marginIsEstimated ||= hasEstimatedMargin(sale.unitCost, sale.qty);

      map.set(key, current);
      return map;
    }, new Map<number, DashboardProductAggregateDto>())
  )
    .map(([, item]) => ({
      ...item,
      qty: roundCurrency(item.qty),
      revenue: roundCurrency(item.revenue),
      profit: roundCurrency(item.profit),
      marginPercent: getDashboardMarginPercent(item.profit, item.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.profit - a.profit);
}

export function getTopMembersToday(
  sales: DashboardSaleRecord[],
  isAdmin: boolean
): DashboardMemberStat[] | null {
  if (!isAdmin) {
    return null;
  }

  return Array.from(
    sales.reduce((map, sale) => {
      const key = sale.memberId;
      const current = map.get(key) ?? {
        memberId: key,
        fullName: sale.member.fullName,
        dni: sale.member.dni,
        salesCount: 0,
        totalAmount: 0,
        totalQty: 0,
        profit: 0,
        marginIsEstimated: false,
      };

      current.salesCount += 1;
      current.totalAmount += getDashboardSaleRevenue(sale);
      current.totalQty += sale.qty;
      current.profit += sale.profit;
      current.marginIsEstimated ||= hasEstimatedMargin(sale.unitCost, sale.qty);

      map.set(key, current);
      return map;
    }, new Map<number, DashboardMemberAggregateDto>())
  )
    .map(([, item]) => ({
      ...item,
      totalAmount: roundCurrency(item.totalAmount),
      totalQty: roundCurrency(item.totalQty),
      profit: roundCurrency(item.profit),
      marginPercent: getDashboardMarginPercent(item.profit, item.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || b.profit - a.profit);
}

export function getRecentDashboardSales(
  sales: DashboardSaleRecord[],
  isAdmin: boolean
): DashboardSale[] | null {
  if (!isAdmin) {
    return null;
  }

  return sales.slice(0, 10).map(serializeDashboardSale);
}

export function getDailyFinance(
  isAdmin: boolean,
  sevenDayKeys: string[],
  sevenDaySales: DashboardSevenDaySaleRecord[],
  sevenDayCashMoves: DashboardSevenDayCashMoveRecord[]
): DashboardDailyFinance[] | null {
  if (!isAdmin) {
    return null;
  }

  return sevenDayKeys.map((date) => {
    const daySales = sevenDaySales.filter(
      (sale) => formatLocalDay(sale.createdAt) === date
    );
    const dayMoves = sevenDayCashMoves.filter(
      (move) => (move.day || formatLocalDay(move.createdAt)) === date
    );
    const daySalesRevenue = roundCurrency(
      daySales.reduce((acc, sale) => acc + getDashboardSaleRevenue(sale), 0)
    );
    const nonSaleIncome = roundCurrency(
      dayMoves
        .filter((move) => move.type === "income")
        .filter(
          (move) =>
            normalizeCashMoveSource(move.source, {
              type: move.type,
              note: move.note,
            }) !== "SALE"
        )
        .reduce((acc, move) => acc + Number(move.amount), 0)
    );
    const income = roundCurrency(daySalesRevenue + nonSaleIncome);
    const expense = roundCurrency(
      dayMoves
        .filter((move) => move.type === "expense")
        .filter(
          (move) =>
            normalizeCashMoveSource(move.source, {
              type: move.type,
              note: move.note,
            }) !== "SALE_CANCELLED"
        )
        .reduce((acc, move) => acc + Number(move.amount), 0)
    );
    const grossProfit = roundCurrency(
      daySales.reduce((acc, sale) => acc + Number(sale.profit || 0), 0)
    );

    return {
      date,
      income,
      expense,
      grossProfit,
      netProfit: roundCurrency(grossProfit - expense),
      salesCount: daySales.length,
    };
  });
}

export function getStockSummary(
  products: DashboardProductRecord[],
  isAdmin: boolean
): DashboardStockSummary | null {
  if (!isAdmin) {
    return null;
  }

  let availableStockValue = 0;
  let reserveStockValue = 0;
  let totalPhysicalStockValue = 0;
  let stockCostValue = 0;
  let stockCostValueEstimated = false;

  for (const product of products) {
    const stock = Number(product.stock);
    const reserveStock = Number(product.reserveStock);
    const physicalStock = stock + reserveStock;
    const price = Number(product.price);
    const averageCost = Number(product.averageCost || 0);

    availableStockValue += stock * price;
    reserveStockValue += reserveStock * price;
    totalPhysicalStockValue += physicalStock * price;
    stockCostValue += physicalStock * averageCost;

    if (physicalStock > 0 && averageCost <= 0) {
      stockCostValueEstimated = true;
    }
  }

  return {
    availableStockValue: roundCurrency(availableStockValue),
    reserveStockValue: roundCurrency(reserveStockValue),
    totalPhysicalStockValue: roundCurrency(totalPhysicalStockValue),
    stockCostValue: roundCurrency(stockCostValue),
    stockCostValueEstimated,
  };
}
