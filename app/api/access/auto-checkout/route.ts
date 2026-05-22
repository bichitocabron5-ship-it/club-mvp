import { createAuditLog } from "@/lib/audit";
import { getCurrentInsideMembers } from "@/lib/access";
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const actorUserId = Number(auth.session.user.id);

  const result = await prisma.$transaction(async (tx) => {
    const membersInside = await getCurrentInsideMembers(tx);

    if (membersInside.length === 0) {
      return {
        count: 0,
        members: [],
      };
    }

    await tx.accessLog.createMany({
      data: membersInside.map((member) => ({
        memberId: member.id,
        type: "OUT",
      })),
    });

    await createAuditLog({
      db: tx,
      actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
      actorEmail: auth.session.user.email,
      action: "ACCESS_AUTO_CHECKOUT_ALL",
      entityType: "AccessLog",
      summary: `Salida automatica de ${membersInside.length} socio(s) por cierre del dia`,
      metadata: {
        count: membersInside.length,
        memberIds: membersInside.map((member) => member.id),
        members: membersInside.map((member) => ({
          id: member.id,
          fullName: member.fullName,
        })),
      },
    });

    return {
      count: membersInside.length,
      members: membersInside.map((member) => ({
        id: member.id,
        fullName: member.fullName,
      })),
    };
  });

  return NextResponse.json(result);
}
