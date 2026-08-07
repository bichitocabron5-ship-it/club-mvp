import { buildTodayDayClosureSummary } from "@/lib/day-closure";
import type { DashboardQueryResultDto } from "@/lib/dtos/dashboard";
import { prisma } from "@/lib/prisma";

const dashboardSaleSelect = {
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
} as const;

type DashboardQueryInput = {
  day: string;
  previousDay: string;
  previousDayStart: Date;
  start: Date;
  end: Date;
  isAdmin: boolean;
  sevenDayStart: Date;
  sevenDayKeys: string[];
};

export async function getDashboardRecords({
  day,
  previousDay,
  previousDayStart,
  start,
  end,
  isAdmin,
  sevenDayStart,
  sevenDayKeys,
}: DashboardQueryInput): Promise<DashboardQueryResultDto> {
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
    previousDaySales,
    comparisonCashMoves,
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
      select: dashboardSaleSelect,
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
    isAdmin
      ? Promise.resolve([])
      : prisma.sale.findMany({
          where: {
            cancelledAt: null,
            createdAt: {
              gte: previousDayStart,
              lt: start,
            },
          },
          select: dashboardSaleSelect,
        }),
    prisma.cashMove.findMany({
      where: {
        OR: [
          {
            day: {
              in: [previousDay, day],
            },
          },
          {
            day: null,
            createdAt: {
              gte: previousDayStart,
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
        paymentMethod: true,
      },
    }),
  ]);

  return {
    dayClosureSummary,
    dayClosure,
    sales,
    previousDaySales,
    products,
    members,
    recentAuditLogs,
    recentAccessLogs,
    accessInToday,
    sevenDaySales,
    sevenDayCashMoves,
    comparisonCashMoves,
  };
}
