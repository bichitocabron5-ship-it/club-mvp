import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin, requireAuth } from "@/lib/auth-server";
import {
  buildDayClosureSummary,
  getDayClosureStatus,
  SIGNIFICANT_CASH_DIFFERENCE,
} from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";

const closeDaySchema = z.object({
  countedCash: z.coerce.number().finite(),
  note: z.string().trim().max(2000).optional().nullable(),
  inventoryCountId: z.coerce.number().int().positive().optional().nullable(),
});

const closureInclude = {
  openedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  closedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  reopenedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { day } = getTodayRange();
  const closure = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
    include: closureInclude,
  });
  const summary = await buildDayClosureSummary(day);
  const status = getDayClosureStatus(closure);

  return NextResponse.json({
    closed: status === "CLOSED",
    status,
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

  if (!existing) {
    return NextResponse.json(
      { error: "Abre el dia antes de registrar el cierre" },
      { status: 409 }
    );
  }

  const existingStatus = getDayClosureStatus(existing);

  if (existingStatus === "CLOSED") {
    return NextResponse.json(
      { error: "El dia ya esta cerrado" },
      { status: 409 }
    );
  }

  if (existingStatus !== "OPEN" && existingStatus !== "REOPENED") {
    return NextResponse.json(
      { error: "El dia debe estar abierto antes de registrar el cierre" },
      { status: 409 }
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

  const summary = await buildDayClosureSummary(day);
  const difference = roundCurrency(countedCash - summary.expectedCash);
  const requiresNote =
    Math.abs(difference) >= SIGNIFICANT_CASH_DIFFERENCE ||
    existingStatus === "REOPENED";

  if (requiresNote && !note) {
    return NextResponse.json(
      {
        error:
          "La nota es obligatoria por diferencia de caja o por cierre reabierto",
      },
      { status: 400 }
    );
  }

  const actorUserId = Number(auth.session.user.id);
  const closedAt = new Date();

  const data = {
    status: "CLOSED",
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    balance: summary.balance,
    openingCash: summary.openingCash,
    expectedCash: summary.expectedCash,
    countedCash,
    difference,
    salesTotal: summary.salesTotal,
    expensesTotal: summary.expensesTotal,
    manualCashTotal: summary.manualCashTotal,
    discountsTotal: summary.discountsTotal,
    closedAt,
    closedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
    inventoryCountId,
    note,
  };

  const closure = await prisma.dayClosure.update({
    where: {
      id: existing.id,
    },
    data,
    include: closureInclude,
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
      status: closure.status,
      openingCash: Number(closure.openingCash),
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
      closedAt: closedAt.toISOString(),
      inventoryCountId: closure.inventoryCountId,
      previousStatus: existing ? existingStatus : null,
    },
  });

  return NextResponse.json(closure);
}
