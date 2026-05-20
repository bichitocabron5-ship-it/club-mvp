// app/api/access/toggle/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const lastLog = await prisma.accessLog.findFirst({
    where: { memberId },
    orderBy: { createdAt: "desc" },
  });

  const nextType = lastLog?.type === "IN" ? "OUT" : "IN";

  const hasContract = await prisma.memberContract.findFirst({
    where: { memberId },
  });

  const now = new Date();

  if (!member.active) {
    return NextResponse.json(
      { error: "Socio bloqueado" },
      { status: 400 }
    );
  }

  if (!hasContract) {
    return NextResponse.json(
      { error: "Contrato no firmado" },
      { status: 400 }
    );
  }

  if (member.expiresAt && new Date(member.expiresAt) < now) {
    return NextResponse.json(
      { error: "Membresía caducada" },
      { status: 400 }
    );
  }

  const log = await prisma.accessLog.create({
    data: {
      memberId,
      type: nextType,
    },
    include: {
      member: true,
    },
  });

  return NextResponse.json({
    log,
    action: nextType,
    message: nextType === "IN" ? "Entrada registrada" : "Salida registrada",
  });
}
