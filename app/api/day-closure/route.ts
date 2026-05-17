// app/api/day-closure/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const day = start.toISOString().slice(0, 10); // "2026-04-25"

  return { start, end, day };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { day } = getTodayRange();

  const closure = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
  });

  return NextResponse.json({
    closed: !!closure,
    closure,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body: {
    countedCash?: unknown;
    note?: unknown;
  } = await req.json().catch(() => ({}));
  const countedCash =
    body.countedCash !== undefined ? Number(body.countedCash) : 0;
  const note = body.note ? String(body.note) : null;
  const { start, end, day } = getTodayRange();

  const existing = await prisma.dayClosure.findUnique({
    where: { day },
  });

  if (existing) {
    return NextResponse.json(
      { error: "El día ya está cerrado" },
      { status: 400 }
    );
  }

  const moves = await prisma.cashMove.findMany({
    where: {
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const totalIncome = moves
    .filter((m: (typeof moves)[number]) => m.type === "income")
    .reduce(
      (acc: number, m: (typeof moves)[number]) => acc + Number(m.amount),
      0
    );

  const totalExpense = moves
    .filter((m: (typeof moves)[number]) => m.type === "expense")
    .reduce(
      (acc: number, m: (typeof moves)[number]) => acc + Number(m.amount),
      0
    );

  const balance = totalIncome - totalExpense;
  const expectedCash = balance;
  const difference = countedCash - expectedCash;

  const closure = await prisma.dayClosure.create({
    data: {
      day,
      totalIncome,
      totalExpense,
      balance,
      expectedCash,
      countedCash,
      difference,
      note,
    },
  });

  return NextResponse.json(closure);
}
