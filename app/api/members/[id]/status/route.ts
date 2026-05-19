// app/api/members/[id]/status/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);
  const body = await req.json();

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const data: {
    active?: boolean;
    expiresAt?: Date | null;
  } = {};

  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  if (body.renewOneYear === true) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    data.expiresAt = expiresAt;
    data.active = true;
  }

  if (body.clearExpiration === true) {
    data.expiresAt = null;
  }

  const existingMember = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      active: true,
      expiresAt: true,
    },
  });

  if (!existingMember) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const member = await prisma.member.update({
    where: { id: memberId },
    data,
  });

  if (
    member.active !== existingMember.active ||
    (member.expiresAt?.toISOString() ?? null) !==
      (existingMember.expiresAt?.toISOString() ?? null)
  ) {
    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "MEMBER_STATUS_UPDATED",
      entityType: "Member",
      entityId: member.id,
      summary: `Estado actualizado para socio #${member.memberNumber ?? member.id}`,
      metadata: {
        active: member.active,
        hasExpiration: Boolean(member.expiresAt),
      },
    });
  }

  return NextResponse.json(member);
}
