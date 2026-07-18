import { requireAuth } from "@/lib/auth-server";
import { formatLocalDay, normalizeCashMoveSource } from "@/lib/cash-move";
import {
  buildTodayDayClosureSummary,
  getDayClosureStatus,
} from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";

const requiredDashboardEnvVars = ["AUTH_SECRET", "DATABASE_URL"] as const;
const HIGH_DISCOUNT_PERCENT_THRESHOLD = 20;
const HIGH_DISCOUNT_AMOUNT_THRESHOLD = 20;

type TodaySaleRecord = {
  id: number;
  memberId: number;
  qty: number;
  totalAmount: number;
  finalAmount: number | null;
  originalAmount: number | null;
  discountAmount: number;
  discountPercent: number;
  unitCost: number;
  profit: number;
  createdAt: Date;
  member: {
    fullName: string;
    dni: string;
  };
  product: {
    id: number;
    name: string;
    unit: string;
  };
};

type ProductAggregate = {
  productId: number;
  name: string;
  unit: string;
  qty: number;
  revenue: number;
  profit: number;
  salesCount: number;
  marginIsEstimated: boolean;
};

type MemberAggregate = {
  memberId: number;
  fullName: string;
  dni: string;
  salesCount: number;
  totalAmount: number;
  totalQty: number;
  profit: number;
  marginIsEstimated: boolean;
};

function getMissingEnvVars(envVars: readonly string[]) {
  return envVars.filter((name) => !process.env[name]?.trim());
}

function getSaleRevenue(sale: { finalAmount: number | null; totalAmount: number }) {
  return Number(sale.finalAmount ?? sale.totalAmount ?? 0);
}

function hasEstimatedMargin(unitCost: number, qty: number) {
  return qty > 0 && Number(unitCost || 0) <= 0;
}

function getMarginPercent(profit: number, revenue: number) {
  if (revenue <= 0) {
    return 0;
  }

  return roundCurrency((profit / revenue) * 100);
}

function toProductSummary(product: {
  id: number;
  name: string;
  unit: string;
  price: number;
  stock: number;
  reserveStock: number;
  minStock: number;
  imageUrl: string | null;
  category: string;
  hashType: string | null;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: product.id,
    name: product.name,
    unit: product.unit,
    price: Number(product.price),
    stock: Number(product.stock),
    reserveStock: Number(product.reserveStock),
    imageUrl: null,
    hasImage: Boolean(product.imageUrl),
    category: product.category,
    hashType: product.hashType,
    minStock: Number(product.minStock),
    active: product.active,
    createdAt: product.createdAt.toISOString(),
  };
}

function buildDayKeys(day: string, count: number) {
  const keys: string[] = [];
  const endDate = new Date(`${day}T00:00:00`);

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const current = new Date(endDate);
    current.setDate(current.getDate() - offset);
    keys.push(formatLocalDay(current));
  }

  return keys;
}

export async function GET() {
  const missingEnvVars = getMissingEnvVars(requiredDashboardEnvVars);

  if (missingEnvVars.length > 0) {
    console.error("[api/dashboard] Missing required env vars", missingEnvVars);

    return NextResponse.json(
      {
        error: `Configuración incompleta del servidor. Faltan: ${missingEnvVars.join(", ")}`,
      },
      { status: 500 }
    );
  }

  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { start, end, day } = getTodayRange();
    const role = auth.session.user.role;
    const isAdmin = role === "ADMIN";
    const sevenDayKeys = buildDayKeys(day, 7);
    const sevenDayStart = new Date(start);
    sevenDayStart.setDate(sevenDayStart.getDate() - 6);

    const [
      dayClosureSummary,
      dayClosure,
      sales,
      products,
      members,
      recentAuditLogs,
      recentAccessLogs,
      accessInToday,
      sevenDaySales,
      sevenDayCashMoves,
    ] = await Promise.all([
      buildTodayDayClosureSummary(),
      prisma.dayClosure.findUnique({
        where: {
          day,
        },
      }),
      prisma.sale.findMany({
        where: {
          cancelledAt: null,
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          memberId: true,
          qty: true,
          totalAmount: true,
          finalAmount: true,
          originalAmount: true,
          discountAmount: true,
          discountPercent: true,
          unitCost: true,
          profit: true,
          createdAt: true,
          member: {
            select: {
              fullName: true,
              dni: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
            },
          },
        },
      }),
      prisma.product.findMany({
        where: {
          active: true,
        },
        orderBy: [{ stock: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          unit: true,
          price: true,
          stock: true,
          reserveStock: true,
          averageCost: true,
          minStock: true,
          imageUrl: true,
          category: true,
          hashType: true,
          active: true,
          createdAt: true,
        },
      }),
      prisma.member.findMany({
        select: {
          accessLogs: {
            take: 1,
            orderBy: {
              createdAt: "desc",
            },
            select: {
              type: true,
            },
          },
        },
      }),
      isAdmin
        ? prisma.auditLog.findMany({
            orderBy: {
              createdAt: "desc",
            },
            take: 8,
            include: {
              actorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.accessLog.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
        include: {
          member: {
            select: {
              fullName: true,
              dni: true,
            },
          },
        },
      }),
      prisma.accessLog.findMany({
        where: {
          type: "IN",
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        select: {
          memberId: true,
        },
      }),
      isAdmin
        ? prisma.sale.findMany({
            where: {
              cancelledAt: null,
              createdAt: {
                gte: sevenDayStart,
                lt: end,
              },
            },
            select: {
              createdAt: true,
              totalAmount: true,
              finalAmount: true,
              profit: true,
              unitCost: true,
            },
          })
        : Promise.resolve([]),
      isAdmin
        ? prisma.cashMove.findMany({
            where: {
              OR: [
                {
                  day: {
                    in: sevenDayKeys,
                  },
                },
                {
                  day: null,
                  createdAt: {
                    gte: sevenDayStart,
                    lt: end,
                  },
                },
              ],
            },
            select: {
              day: true,
              createdAt: true,
              type: true,
              amount: true,
              source: true,
              note: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const typedSales: TodaySaleRecord[] = sales.map((sale) => ({
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

    const lowStockProducts = products
      .filter((product) => Number(product.stock) <= Number(product.minStock))
      .slice(0, 10)
      .map(toProductSummary);
    const currentInsideCount = members.filter(
      (member) => member.accessLogs[0]?.type === "IN"
    ).length;

    const salesTodayTotal = roundCurrency(
      typedSales.reduce((acc, sale) => acc + getSaleRevenue(sale), 0)
    );
    const profitToday = roundCurrency(
      typedSales.reduce((acc, sale) => acc + Number(sale.profit || 0), 0)
    );
    const marginIsEstimated = typedSales.some((sale) =>
      hasEstimatedMargin(sale.unitCost, sale.qty)
    );
    const marginPercent = getMarginPercent(profitToday, salesTodayTotal);
    const discountsTodayTotal = roundCurrency(
      typedSales.reduce((acc, sale) => acc + Number(sale.discountAmount || 0), 0)
    );
    const activeMembersToday = new Set(accessInToday.map((log) => log.memberId)).size;
    const highDiscountSalesCount = typedSales.filter(
      (sale) =>
        Number(sale.discountPercent || 0) >= HIGH_DISCOUNT_PERCENT_THRESHOLD ||
        Number(sale.discountAmount || 0) >= HIGH_DISCOUNT_AMOUNT_THRESHOLD
    ).length;

    const dayClosureStatus = getDayClosureStatus(dayClosure);
    const pendingAlerts = [];

    if (dayClosureStatus === "PENDING") {
      pendingAlerts.push({
        id: "day-opening-pending",
        type: "DAY_OPENING_PENDING",
        severity: "warning",
        title: "Apertura de caja pendiente",
        description: `Registra la caja inicial de ${day} antes del cierre diario.`,
        href: "/cash",
      });
    }

    if (dayClosureStatus === "OPEN") {
      pendingAlerts.push({
        id: "day-closure-pending",
        type: "DAY_CLOSURE_PENDING",
        severity: "info",
        title: "Cierre de caja pendiente",
        description: `El dia ${day} esta abierto y pendiente de cierre.`,
        href: "/cash",
      });
    }

    if (dayClosureStatus === "CLOSED") {
      pendingAlerts.push({
        id: "day-closure-closed",
        type: "DAY_CLOSED",
        severity: "info",
        title: "Caja del día cerrada",
        description: `El cierre de ${day} ya esta registrado.`,
        href: "/cash",
      });
    }

    if (dayClosureStatus === "REOPENED") {
      pendingAlerts.push({
        id: "day-closure-reopened",
        type: "DAY_REOPENED",
        severity: "warning",
        title: "Caja reabierta",
        description: `El cierre de ${day} fue reabierto y necesita seguimiento.`,
        href: "/cash",
      });
    }

    if (dayClosure && Number(dayClosure.difference) !== 0) {
      pendingAlerts.push({
        id: "cash-difference",
        type: "CASH_DIFFERENCE",
        severity: "danger",
        title: "Diferencia de caja detectada",
        description: `La diferencia actual del cierre es ${roundCurrency(
          Number(dayClosure.difference)
        ).toFixed(2)} EUR.`,
        href: "/cash",
      });
    }

    if (dayClosureSummary.inventoryCountsOpenCount > 0) {
      pendingAlerts.push({
        id: "open-inventory-counts",
        type: "OPEN_INVENTORY_COUNTS",
        severity: "warning",
        title: "Conteos de inventario abiertos",
        description: `Hay ${dayClosureSummary.inventoryCountsOpenCount} conteo(s) pendientes de cerrar hoy.`,
        href: "/stock/counts",
      });
    }

    if (lowStockProducts.length > 0) {
      pendingAlerts.push({
        id: "low-stock-products",
        type: "LOW_STOCK",
        severity: "danger",
        title: "Productos con stock bajo",
        description: `${lowStockProducts.length} producto(s) están por debajo del mínimo configurado.`,
        href: "/stock",
      });
    }

    if (highDiscountSalesCount > 0) {
      pendingAlerts.push({
        id: "high-discount-sales",
        type: "HIGH_DISCOUNT_SALES",
        severity: "warning",
        title: "Ventas con descuentos altos",
        description: `${highDiscountSalesCount} venta(s) superan el umbral de descuento del día.`,
        href: "/sales",
      });
    }

    const visiblePendingAlerts = isAdmin
      ? pendingAlerts
      : pendingAlerts.filter(
          (alert) =>
            alert.type === "LOW_STOCK" || alert.type === "OPEN_INVENTORY_COUNTS"
        );

    const topProductsToday = isAdmin
      ? Array.from(
          typedSales.reduce((map, sale) => {
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
            current.revenue += getSaleRevenue(sale);
            current.profit += sale.profit;
            current.salesCount += 1;
            current.marginIsEstimated ||= hasEstimatedMargin(sale.unitCost, sale.qty);

            map.set(key, current);
            return map;
          }, new Map<number, ProductAggregate>())
        )
          .map(([, item]) => ({
            ...item,
            qty: roundCurrency(item.qty),
            revenue: roundCurrency(item.revenue),
            profit: roundCurrency(item.profit),
            marginPercent: getMarginPercent(item.profit, item.revenue),
          }))
          .sort((a, b) => b.revenue - a.revenue || b.profit - a.profit)
      : null;

    const topMembersToday = isAdmin
      ? Array.from(
          typedSales.reduce((map, sale) => {
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
            current.totalAmount += getSaleRevenue(sale);
            current.totalQty += sale.qty;
            current.profit += sale.profit;
            current.marginIsEstimated ||= hasEstimatedMargin(sale.unitCost, sale.qty);

            map.set(key, current);
            return map;
          }, new Map<number, MemberAggregate>())
        )
          .map(([, item]) => ({
            ...item,
            totalAmount: roundCurrency(item.totalAmount),
            totalQty: roundCurrency(item.totalQty),
            profit: roundCurrency(item.profit),
            marginPercent: getMarginPercent(item.profit, item.totalAmount),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount || b.profit - a.profit)
      : null;

    const recentSales = isAdmin
      ? typedSales.slice(0, 10).map((sale) => ({
          id: sale.id,
          qty: sale.qty,
          totalAmount: sale.totalAmount,
          unitCost: sale.unitCost,
          profit: sale.profit,
          originalAmount: sale.originalAmount,
          discountAmount: sale.discountAmount,
          discountPercent: sale.discountPercent,
          finalAmount: sale.finalAmount,
          createdAt: sale.createdAt.toISOString(),
          member: {
            fullName: sale.member.fullName,
          },
          product: {
            name: sale.product.name,
            unit: sale.product.unit,
          },
        }))
      : null;

    const dailyFinance = isAdmin
      ? sevenDayKeys.map((date) => {
          const daySales = sevenDaySales.filter(
            (sale) => formatLocalDay(sale.createdAt) === date
          );
          const dayMoves = sevenDayCashMoves.filter(
            (move) => (move.day || formatLocalDay(move.createdAt)) === date
          );
          const daySalesRevenue = roundCurrency(
            daySales.reduce((acc, sale) => acc + getSaleRevenue(sale), 0)
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
          const income = roundCurrency(
            daySalesRevenue + nonSaleIncome
          );
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
        })
      : null;

    const stockSummary = isAdmin
      ? (() => {
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
        })()
      : null;

    return NextResponse.json({
      role,
      generatedAt: new Date().toISOString(),
      summary: {
        salesTodayTotal,
        salesTodayCount: typedSales.length,
        profitToday,
        marginPercent,
        marginIsEstimated,
        discountsTodayTotal,
        expensesTodayTotal: dayClosureSummary.expensesTotal,
        activeMembersToday,
        currentInsideCount,
        lowStockProductsCount: lowStockProducts.length,
      },
      cash: isAdmin
        ? {
            salesTodayTotal,
            salesTodayCount: typedSales.length,
            profitToday,
            marginPercent,
            marginIsEstimated,
            discountsTodayTotal,
            expensesTodayTotal: dayClosureSummary.expensesTotal,
            cashExpectedToday: dayClosureSummary.expectedCash,
            cashBalanceToday: dayClosureSummary.balance,
            dayClosureStatus,
            dayClosureDifference:
              dayClosure && dayClosureStatus !== "OPEN" && dayClosureStatus !== "PENDING"
              ? roundCurrency(Number(dayClosure.difference))
              : null,
          }
        : null,
      inventory: {
        openInventoryCountsCount: dayClosureSummary.inventoryCountsOpenCount,
        confirmedInventoryCountsToday: dayClosureSummary.inventoryCountsConfirmedCount,
      },
      topProductsToday,
      topMembersToday,
      recentSales,
      dailyFinance,
      stockSummary,
      lowStockProducts,
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        summary: log.summary,
        actorEmail: log.actorEmail,
        createdAt: log.createdAt.toISOString(),
        actorUser: log.actorUser,
      })),
      recentAccessLogs: recentAccessLogs.map((log) => ({
        id: log.id,
        type: log.type,
        createdAt: log.createdAt.toISOString(),
        member: {
          fullName: log.member.fullName,
          dni: log.member.dni,
        },
      })),
      pendingAlerts: visiblePendingAlerts,
    });
  } catch (error) {
    console.error("[api/dashboard] Failed to build dashboard response", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno cargando el panel",
      },
      { status: 500 }
    );
  }
}
