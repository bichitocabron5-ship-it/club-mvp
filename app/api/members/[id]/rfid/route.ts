// app/api/members/[id]/rfid/route.ts
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

  const rfidCode = String(body.rfidCode || "").trim();

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  if (!rfidCode) {
    return NextResponse.json(
      { error: "Código RFID inválido" },
      { status: 400 }
    );
  }

  try {
    const existingMember = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        memberNumber: true,
        rfidCode: true,
      },
    });

    if (!existingMember) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    }

    const member = await prisma.member.update({
      where: { id: memberId },
      data: { rfidCode },
    });

    if (existingMember.rfidCode !== member.rfidCode) {
      await createAuditLog({
        actorUserId: Number(auth.session.user.id),
        actorEmail: auth.session.user.email,
        action: "MEMBER_RFID_UPDATED",
        entityType: "Member",
        entityId: member.id,
        summary: `RFID actualizado para socio #${member.memberNumber ?? member.id}`,
        metadata: {
          hadRfid: Boolean(existingMember.rfidCode),
          hasRfid: Boolean(member.rfidCode),
        },
      });
    }

    return NextResponse.json(member);
  } catch {
    return NextResponse.json(
      { error: "Esta chapita ya está asignada a otro socio" },
      { status: 400 }
    );
  }
}
