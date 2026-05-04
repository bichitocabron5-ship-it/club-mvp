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

  const [cashMoves, sales, products, members, lastAccessLogs] =
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
    ]);

  const income = cashMoves
    .filter((m) => m.type === "income")
    .reduce((acc, m) => acc + Number(m.amount), 0);

  const expense = cashMoves
    .filter((m) => m.type === "expense")
    .reduce((acc, m) => acc + Number(m.amount), 0);

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

  return NextResponse.json({
    income,
    expense,
    balance: income - expense,

    salesCount: sales.length,
    activeMembersToday,
    currentInsideCount: insideMembers.length,

    lowStock,
    lastSales: sales.slice(0, 8),
    lastAccessLogs,

    alerts: {
      membersWithoutContract: membersWithoutContract.length,
      expiredMembers: expiredMembers.length,
      blockedMembers: blockedMembers.length,
      lowStock: lowStock.length,
    },
  });
}