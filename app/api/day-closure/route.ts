import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin, requireAuth } from "@/lib/auth-server";
import { buildTodayDayClosureSummary, isClosureOpen } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";

const closeDaySchema = z.object({
  countedCash: z.coerce.number().finite(),
  note: z.string().trim().max(2000).optional().nullable(),
  inventoryCountId: z.coerce.number().int().positive().optional().nullable(),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { day } = getTodayRange();
  const [closure, summary] = await Promise.all([
    prisma.dayClosure.findUnique({
      where: {
        day,
      },
    }),
    buildTodayDayClosureSummary(),
  ]);

  return NextResponse.json({
    closed: isClosureOpen(closure),
    closure,
    summary,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = closeDaySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const countedCash = roundCurrency(parsed.data.countedCash);
  const note = parsed.data.note?.trim() || null;
  const inventoryCountId = parsed.data.inventoryCountId ?? null;
  const { start, end, day } = getTodayRange();

  const existing = await prisma.dayClosure.findUnique({
    where: { day },
  });

  if (existing && !existing.reopenedAt) {
    return NextResponse.json(
      { error: "El dia ya esta cerrado" },
      { status: 400 }
    );
  }

  if (inventoryCountId !== null) {
    const inventoryCount = await prisma.inventoryCount.findFirst({
      where: {
        id: inventoryCountId,
        createdAt: {
          gte: start,
          lt: end,
        },
        status: {
          in: ["OPEN", "CONFIRMED"],
        },
      },
      select: {
        id: true,
      },
    });

    if (!inventoryCount) {
      return NextResponse.json(
        { error: "El conteo seleccionado no es valido para hoy" },
        { status: 400 }
      );
    }
  }

  const summary = await buildTodayDayClosureSummary();
  const difference = roundCurrency(countedCash - summary.expectedCash);
  const actorUserId = Number(auth.session.user.id);

  const data = {
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    balance: summary.balance,
    expectedCash: summary.expectedCash,
    countedCash,
    difference,
    salesTotal: summary.salesTotal,
    expensesTotal: summary.expensesTotal,
    manualCashTotal: summary.manualCashTotal,
    discountsTotal: summary.discountsTotal,
    closedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
    inventoryCountId,
    note,
    reopenedAt: null,
    reopenedByUserId: null,
    reopenReason: null,
  };

  const closure = existing?.reopenedAt
    ? await prisma.dayClosure.update({
        where: {
          id: existing.id,
        },
        data,
      })
    : await prisma.dayClosure.create({
        data: {
          day,
          ...data,
        },
      });

  await createAuditLog({
    actorUserId,
    actorEmail: auth.session.user.email,
    action: "DAY_CLOSURE_CREATED",
    entityType: "DayClosure",
    entityId: closure.id,
    summary: `Cierre de caja creado para ${closure.day}`,
    metadata: {
      day: closure.day,
      totalIncome: Number(closure.totalIncome),
      totalExpense: Number(closure.totalExpense),
      balance: Number(closure.balance),
      salesTotal: Number(closure.salesTotal),
      expensesTotal: Number(closure.expensesTotal),
      manualCashTotal: Number(closure.manualCashTotal),
      discountsTotal: Number(closure.discountsTotal),
      expectedCash: Number(closure.expectedCash),
      countedCash: Number(closure.countedCash),
      difference: Number(closure.difference),
      inventoryCountId: closure.inventoryCountId,
      reopenedClosureId: existing?.reopenedAt ? existing.id : null,
    },
  });

  return NextResponse.json(closure);
}
