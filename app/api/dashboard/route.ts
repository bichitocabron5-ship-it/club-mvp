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

  const [cashMoves, sales, products, members, lastAccessLogs, expenses] =
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

    lowStock,
    lastSales: sales.slice(0, 8),
    lastAccessLogs,

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