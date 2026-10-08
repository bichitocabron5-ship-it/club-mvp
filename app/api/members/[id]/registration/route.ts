import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const { id } = await params;
  const memberId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
    return NextResponse.json({ error: "ID de socio inválido" }, { status: 400, headers });
  }
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, memberNumber: true, fullName: true, dni: true, phone: true, email: true, active: true, expiresAt: true, rfidCode: true },
  });
  if (!member) return NextResponse.json({ error: "Socio no encontrado" }, { status: 404, headers });
  return NextResponse.json({ member: {
    id: member.id,
    memberNumber: member.memberNumber,
    fullName: member.fullName,
    dni: member.dni,
    phone: member.phone,
    email: member.email,
    active: member.active,
    expiresAt: member.expiresAt,
    rfidCode: member.rfidCode,
  } }, { headers });
}

