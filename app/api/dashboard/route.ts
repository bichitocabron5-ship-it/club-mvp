// app/api/dashboard/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

export async function GET() {
  const { start, end } = getTodayRange();

  const [cashMoves, sales, products, members, lastAccessLogs, expenses, purchases,recentClosures] =
    await Promise.all([
      prisma.cashMove.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
      }),

      prisma.sale.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        include: {
          member: true,
          product: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.product.findMany({
        orderBy: {
          stock: "asc",
        },
      }),

      prisma.member.findMany({
        include: {
          contracts: {
            take: 1,
            orderBy: {
              signedAt: "desc",
            },
          },
          accessLogs: {
            take: 1,
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: {
          fullName: "asc",
        },
      }),

      prisma.accessLog.findMany({
        include: {
          member: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      }),

      prisma.expense.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.purchase.findMany({
        where: {
          status: {
            in: ["PENDING", "PARTIAL"],
          },
        },
        include: {
          supplier: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

     prisma.dayClosure.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }), 
    ]);

  const income = cashMoves
    .filter((m) => m.type === "income")
    .reduce((acc, m) => acc + Number(m.amount), 0);

  const grossProfit = sales.reduce(
    (acc, sale) => acc + Number(sale.profit || 0),
    0
  );

  const expense = cashMoves
    .filter((m) => m.type === "expense")
    .reduce((acc, m) => acc + Number(m.amount), 0);

  const netProfit = grossProfit - expense;

  const lowStock = products.filter(
    (p) => Number(p.stock) <= Number(p.minStock)
  );

  const activeMembersToday = new Set(sales.map((s) => s.memberId)).size;

  const insideMembers = members.filter(
    (m) => m.accessLogs[0]?.type === "IN"
  );

  const now = new Date();

  const membersWithoutContract = members.filter(
    (m) => m.contracts.length === 0
  );

  const expiredMembers = members.filter(
    (m) => m.expiresAt && new Date(m.expiresAt) < now
  );

  const blockedMembers = members.filter((m) => !m.active);

  const expensesByCategory = expenses.reduce<Record<string, number>>(
    (acc, expense) => {
      acc[expense.category] =
        (acc[expense.category] || 0) + Number(expense.amount);

      return acc;
    },
    {}
  );

  const productStatsMap = new Map<
    number,
    {
      productId: number;
      name: string;
      unit: string;
      qty: number;
      revenue: number;
      profit: number;
      salesCount: number;
    }
  >();

  for (const sale of sales) {
    const existing = productStatsMap.get(sale.productId);

    if (existing) {
      existing.qty += Number(sale.qty);
      existing.revenue += Number(sale.totalAmount);
      existing.profit += Number(sale.profit || 0);
      existing.salesCount += 1;
    } else {
      productStatsMap.set(sale.productId, {
        productId: sale.productId,
        name: sale.product.name,
        unit: sale.product.unit,
        qty: Number(sale.qty),
        revenue: Number(sale.totalAmount),
        profit: Number(sale.profit || 0),
        salesCount: 1,
      });
    }
  }

  const productStats = Array.from(productStatsMap.values());

  const topProductsByRevenue = [...productStats]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topProductsByProfit = [...productStats]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const worstProductsByProfit = [...productStats]
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const memberStatsMap = new Map<
    number,
    {
      memberId: number;
      fullName: string;
      dni: string;
      salesCount: number;
      totalAmount: number;
      totalQty: number;
      profit: number;
    }
  >();

  for (const sale of sales) {
    const existing = memberStatsMap.get(sale.memberId);

    if (existing) {
      existing.salesCount += 1;
      existing.totalAmount += Number(sale.totalAmount);
      existing.totalQty += Number(sale.qty);
      existing.profit += Number(sale.profit || 0);
    } else {
      memberStatsMap.set(sale.memberId, {
        memberId: sale.memberId,
        fullName: sale.member.fullName,
        dni: sale.member.dni,
        salesCount: 1,
        totalAmount: Number(sale.totalAmount),
        totalQty: Number(sale.qty),
        profit: Number(sale.profit || 0),
      });
    }
  }

  const topMembersByAmount = Array.from(memberStatsMap.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);

  const sevenDaysAgo = new Date(start);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [cashMoves7d, sales7d] = await Promise.all([
    prisma.cashMove.findMany({
      where: {
        createdAt: {
          gte: sevenDaysAgo,
          lt: end,
        },
      },
    }),
    prisma.sale.findMany({
      where: {
        createdAt: {
          gte: sevenDaysAgo,
          lt: end,
        },
      },
    }),
  ]);

  const dailyMap = new Map<
    string,
    {
      date: string;
      income: number;
      expense: number;
      grossProfit: number;
      netProfit: number;
      salesCount: number;
    }
  >();

  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo);
    day.setDate(sevenDaysAgo.getDate() + i);
    const key = day.toISOString().slice(0, 10);

    dailyMap.set(key, {
      date: key,
      income: 0,
      expense: 0,
      grossProfit: 0,
      netProfit: 0,
      salesCount: 0,
    });
  }

  for (const move of cashMoves7d) {
    const key = move.createdAt.toISOString().slice(0, 10);
    const day = dailyMap.get(key);
    if (!day) continue;

    if (move.type === "income") {
      day.income += Number(move.amount);
    }

    if (move.type === "expense") {
      day.expense += Number(move.amount);
    }
  }

  for (const sale of sales7d) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const day = dailyMap.get(key);
    if (!day) continue;

    day.grossProfit += Number(sale.profit || 0);
    day.salesCount += 1;
  }

  const dailyFinance = Array.from(dailyMap.values()).map((day) => ({
    ...day,
    netProfit: day.grossProfit - day.expense,
  }));

  const supplierDebt = purchases.reduce(
    (acc, purchase) =>
      acc + (Number(purchase.totalAmount) - Number(purchase.paidAmount)),
    0
  );

  const pendingPurchases = purchases.slice(0, 8).map((purchase) => ({
    id: purchase.id,
    supplierName: purchase.supplier.name,
    totalAmount: Number(purchase.totalAmount),
    paidAmount: Number(purchase.paidAmount),
    pendingAmount: Number(purchase.totalAmount) - Number(purchase.paidAmount),
    status: purchase.status,
    createdAt: purchase.createdAt,
  }));

  return NextResponse.json({
    income,
    expense,
    balance: income - expense,
    grossProfit,
    netProfit,

    salesCount: sales.length,
    activeMembersToday,
    currentInsideCount: insideMembers.length,

    topProductsByRevenue,
    topProductsByProfit,
    worstProductsByProfit,
    topMembersByAmount,

    lowStock,
    lastSales: sales.slice(0, 8),
    lastAccessLogs,
    dailyFinance,
    recentClosures,

    supplierDebt,
    pendingPurchases,

    expensesToday: expenses,
    expensesByCategory,

    alerts: {
      membersWithoutContract: membersWithoutContract.length,
      expiredMembers: expiredMembers.length,
      blockedMembers: blockedMembers.length,
      lowStock: lowStock.length,
    },
  });
}