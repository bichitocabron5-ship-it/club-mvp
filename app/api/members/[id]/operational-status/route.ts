// app/api/members/[id]/operational-status/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memberId = Number(id);

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const contract = await prisma.memberContract.findFirst({
    where: { memberId },
    orderBy: { signedAt: "desc" },
  });

  const expired =
    member.expiresAt !== null && new Date(member.expiresAt) < new Date();

  const canWithdraw = member.active && !expired && !!contract;

  return NextResponse.json({
    member,
    hasContract: !!contract,
    expired,
    canWithdraw,
    reasons: {
      inactive: !member.active,
      noContract: !contract,
      expired,
    },
  });
}