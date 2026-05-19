// app/api/cash/route.ts
import { requireAdmin, requireAuth } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  CASH_MOVE_PAYMENT_METHODS,
  formatLocalDay,
} from "@/lib/cash-move";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const manualCashMoveSchema = z
  .object({
    type: z.enum(["income", "expense"]),
    amount: z.coerce.number().positive(),
    note: z.string().trim().min(1, "El motivo es obligatorio"),
    source: z.enum(["MANUAL", "ADJUSTMENT"]).optional(),
    paymentMethod: z.enum(CASH_MOVE_PAYMENT_METHODS).optional(),
  })
  .strict();

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const moves = await prisma.cashMove.findMany({
    include: {
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(moves);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = manualCashMoveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const actorUserId = Number(auth.session.user.id);

  const move = await prisma.cashMove.create({
    data: {
      type: parsed.data.type,
      amount: parsed.data.amount,
      note: parsed.data.note,
      source: parsed.data.source ?? "MANUAL",
      paymentMethod: parsed.data.paymentMethod ?? "CASH",
      createdByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
      day: formatLocalDay(),
    },
    include: {
      createdByUser: {
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
    action: "CASH_MOVE_CREATED",
    entityType: "CashMove",
    entityId: move.id,
    summary: `Movimiento manual de caja ${move.type}`,
    metadata: {
      type: move.type,
      amount: Number(move.amount),
      note: move.note,
      source: move.source,
      paymentMethod: move.paymentMethod,
    },
  });

  return NextResponse.json(move);
}
