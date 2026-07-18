import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import { getDayClosureStatus } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";

const openDaySchema = z
  .object({
    openingCash: z.coerce.number().finite().min(0).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = openDaySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { day } = getTodayRange();
  const existing = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
  });
  const status = getDayClosureStatus(existing);

  if (existing) {
    const message =
      status === "CLOSED"
        ? "El dia ya esta cerrado"
        : status === "REOPENED"
          ? "El cierre ya esta reabierto"
          : "El dia ya esta abierto";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const actorUserId = Number(auth.session.user.id);
  const openedAt = new Date();
  const openingCash = roundCurrency(parsed.data.openingCash ?? 0);

  try {
    const closure = await prisma.dayClosure.create({
      data: {
        day,
        status: "OPEN",
        openingCash,
        expectedCash: openingCash,
        openedAt,
        openedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
      },
      include: {
        openedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await createAuditLog({
      actorUserId,
      actorEmail: auth.session.user.email,
      action: "DAY_CLOSURE_OPENED",
      entityType: "DayClosure",
      entityId: closure.id,
      summary: `Apertura de caja registrada para ${closure.day}`,
      metadata: {
        day: closure.day,
        status: closure.status,
        openingCash: Number(closure.openingCash),
        openedAt: openedAt.toISOString(),
      },
    });

    return NextResponse.json(closure, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "El dia ya tiene apertura o cierre" },
        { status: 400 }
      );
    }

    throw error;
  }
}
