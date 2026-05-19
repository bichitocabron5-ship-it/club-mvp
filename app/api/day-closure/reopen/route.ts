import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getTodayRange } from "@/lib/sales";
import { NextResponse } from "next/server";

const reopenSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = reopenSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "El motivo de reapertura es obligatorio" },
      { status: 400 }
    );
  }

  const { day } = getTodayRange();
  const closure = await prisma.dayClosure.findUnique({
    where: {
      day,
    },
  });

  if (!closure) {
    return NextResponse.json(
      { error: "No existe cierre para hoy" },
      { status: 404 }
    );
  }

  if (closure.reopenedAt) {
    return NextResponse.json(
      { error: "El cierre de hoy ya esta reabierto" },
      { status: 400 }
    );
  }

  const actorUserId = Number(auth.session.user.id);
  const reopenedAt = new Date();

  const reopenedClosure = await prisma.dayClosure.update({
    where: {
      id: closure.id,
    },
    data: {
      reopenedAt,
      reopenedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
      reopenReason: parsed.data.reason,
    },
  });

  await createAuditLog({
    actorUserId,
    actorEmail: auth.session.user.email,
    action: "DAY_CLOSURE_REOPENED",
    entityType: "DayClosure",
    entityId: reopenedClosure.id,
    summary: `Cierre de caja reabierto para ${reopenedClosure.day}`,
    metadata: {
      day: reopenedClosure.day,
      reopenedAt: reopenedAt.toISOString(),
      reopenReason: reopenedClosure.reopenReason,
    },
  });

  return NextResponse.json(reopenedClosure);
}
