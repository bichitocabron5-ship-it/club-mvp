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

  const cashMoves = await prisma.cashMove.findMany({
    where: {
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const sales = await prisma.sale.findMany({
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
  });

  const products = await prisma.product.findMany({
    orderBy: {
      stock: "asc",
    },
  });

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

  return NextResponse.json({
    income,
    expense,
    balance: income - expense,
    salesCount: sales.length,
    activeMembersToday,
    lowStock,
    lastSales: sales.slice(0, 8),
  });
}