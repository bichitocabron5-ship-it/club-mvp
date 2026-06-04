// app/api/access/toggle/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { NextResponse } from "next/server";

type AccessMemberRecord = {
  id: number;
  memberNumber: string | null;
  fullName: string;
  dni: string;
  photoUrl: string | null;
  active: boolean;
  expiresAt: Date | null;
  rfidCode: string | null;
};

async function serializeAccessMember(member: AccessMemberRecord) {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    displayNumber: member.memberNumber ?? String(member.id),
    fullName: member.fullName,
    dni: member.dni,
    photoUrl: await resolveStorageUrlForResponse(member.photoUrl),
    active: member.active,
    expiresAt: member.expiresAt?.toISOString() ?? null,
    rfidCode: member.rfidCode,
  };
}

export async function POST(req: Request) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const memberId = Number(body.memberId);

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "Socio inválido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      fullName: true,
      dni: true,
      photoUrl: true,
      active: true,
      expiresAt: true,
      rfidCode: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const lastLog = await prisma.accessLog.findFirst({
    where: { memberId },
    orderBy: { createdAt: "desc" },
  });

  const nextType = lastLog?.type === "IN" ? "OUT" : "IN";
  const responseMember = await serializeAccessMember(member);

  const hasContract = await prisma.memberContract.findFirst({
    where: { memberId },
    select: {
      id: true,
    },
  });

  const now = new Date();

  if (!member.active) {
    return NextResponse.json(
      { error: "Socio inactivo", member: responseMember },
      { status: 400 }
    );
  }

  if (!hasContract) {
    return NextResponse.json(
      { error: "Contrato no firmado", member: responseMember },
      { status: 400 }
    );
  }

  if (member.expiresAt && new Date(member.expiresAt) < now) {
    return NextResponse.json(
      { error: "Membresia caducada", member: responseMember },
      { status: 400 }
    );
  }

  const log = await prisma.accessLog.create({
    data: {
      memberId,
      type: nextType,
    },
  });

  return NextResponse.json({
    log: {
      id: log.id,
      memberId: log.memberId,
      type: log.type,
      createdAt: log.createdAt.toISOString(),
    },
    action: nextType,
    message: nextType === "IN" ? "Entrada registrada" : "Salida registrada",
    member: responseMember,
    lastAccess: {
      id: log.id,
      type: log.type,
      createdAt: log.createdAt.toISOString(),
    },
  });
}
