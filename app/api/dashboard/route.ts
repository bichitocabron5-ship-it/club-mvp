import { requireAuth } from "@/lib/auth-server";
import { buildTodayDayClosureSummary } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";

const requiredDashboardEnvVars = ["AUTH_SECRET", "DATABASE_URL"] as const;
const HIGH_DISCOUNT_PERCENT_THRESHOLD = 20;
const HIGH_DISCOUNT_AMOUNT_THRESHOLD = 20;

function getMissingEnvVars(envVars: readonly string[]) {
  return envVars.filter((name) => !process.env[name]?.trim());
}

function getDayClosureStatus(closure: { reopenedAt: Date | null } | null) {
  if (!closure) {
    return "OPEN" as const;
  }

  if (closure.reopenedAt) {
    return "REOPENED" as const;
  }

  return "CLOSED" as const;
}

function toProductSummary(product: {
  id: number;
  name: string;
  unit: string;
  price: number;
  stock: number;
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
    imageUrl: product.imageUrl,
    category: product.category,
    hashType: product.hashType,
    minStock: Number(product.minStock),
    active: product.active,
    createdAt: product.createdAt.toISOString(),
  };
}

export async function GET() {
  const missingEnvVars = getMissingEnvVars(requiredDashboardEnvVars);

  if (missingEnvVars.length > 0) {
    console.error("[api/dashboard] Missing required env vars", missingEnvVars);

    return NextResponse.json(
      {
        error: `Configuracion incompleta del servidor. Faltan: ${missingEnvVars.join(", ")}`,
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

    const [
      dayClosureSummary,
      dayClosure,
      sales,
      products,
      members,
      recentAuditLogs,
      recentAccessLogs,
      accessInToday,
    ] = await Promise.all([
      buildTodayDayClosureSummary(),
      prisma.dayClosure.findUnique({
        where: {
          day,
        },
      }),
      prisma.sale.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        select: {
          id: true,
          memberId: true,
          totalAmount: true,
          profit: true,
          discountAmount: true,
          discountPercent: true,
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
    ]);

    const lowStockProducts = products
      .filter((product) => Number(product.stock) <= Number(product.minStock))
      .slice(0, 10)
      .map(toProductSummary);
    const currentInsideCount = members.filter(
      (member) => member.accessLogs[0]?.type === "IN"
    ).length;

    const salesTodayTotal = roundCurrency(
      sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0)
    );
    const profitToday = roundCurrency(
      sales.reduce((acc, sale) => acc + Number(sale.profit || 0), 0)
    );
    const discountsTodayTotal = roundCurrency(
      sales.reduce((acc, sale) => acc + Number(sale.discountAmount || 0), 0)
    );
    const activeMembersToday = new Set(accessInToday.map((log) => log.memberId)).size;
    const highDiscountSalesCount = sales.filter(
      (sale) =>
        Number(sale.discountPercent || 0) >= HIGH_DISCOUNT_PERCENT_THRESHOLD ||
        Number(sale.discountAmount || 0) >= HIGH_DISCOUNT_AMOUNT_THRESHOLD
    ).length;

    const dayClosureStatus = getDayClosureStatus(dayClosure);
    const pendingAlerts = [];

    if (dayClosureStatus === "CLOSED") {
      pendingAlerts.push({
        id: "day-closure-closed",
        type: "DAY_CLOSED",
        severity: "info",
        title: "Caja del dia cerrada",
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
        description: `${lowStockProducts.length} producto(s) estan por debajo del minimo configurado.`,
        href: "/stock",
      });
    }

    if (highDiscountSalesCount > 0) {
      pendingAlerts.push({
        id: "high-discount-sales",
        type: "HIGH_DISCOUNT_SALES",
        severity: "warning",
        title: "Ventas con descuentos altos",
        description: `${highDiscountSalesCount} venta(s) superan el umbral de descuento del dia.`,
        href: "/sales",
      });
    }

    const visiblePendingAlerts = isAdmin
      ? pendingAlerts
      : pendingAlerts.filter(
          (alert) =>
            alert.type === "LOW_STOCK" || alert.type === "OPEN_INVENTORY_COUNTS"
        );

    return NextResponse.json({
      role,
      generatedAt: new Date().toISOString(),
      summary: {
        salesTodayTotal,
        salesTodayCount: sales.length,
        profitToday,
        discountsTodayTotal,
        expensesTodayTotal: dayClosureSummary.expensesTotal,
        activeMembersToday,
        currentInsideCount,
        lowStockProductsCount: lowStockProducts.length,
      },
      cash: isAdmin
        ? {
            salesTodayTotal,
            salesTodayCount: sales.length,
            profitToday,
            discountsTodayTotal,
            expensesTodayTotal: dayClosureSummary.expensesTotal,
            cashExpectedToday: dayClosureSummary.expectedCash,
            cashBalanceToday: dayClosureSummary.balance,
            dayClosureStatus,
            dayClosureDifference: dayClosure
              ? roundCurrency(Number(dayClosure.difference))
              : null,
          }
        : null,
      inventory: {
        openInventoryCountsCount: dayClosureSummary.inventoryCountsOpenCount,
        confirmedInventoryCountsToday: dayClosureSummary.inventoryCountsConfirmedCount,
      },
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
            : "Error interno cargando el dashboard",
      },
      { status: 500 }
    );
  }
}
