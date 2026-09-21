// app/api/members/[id]/operational-status/route.ts
import { requireAuth } from "@/lib/auth-server";
import { getMemberOperationalFacts } from "@/lib/member-operational-status";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
    select: {
      id: true,
      consumptionGrams: true,
    },
  });

  const now = new Date();
  const facts = getMemberOperationalFacts(
    {
      active: member.active,
      expiresAt: member.expiresAt,
      rfidCode: member.rfidCode,
    },
    contract,
    now,
  );

  const canWithdraw = facts.active && !facts.expired && facts.hasContract;

  return NextResponse.json({
    member,
    hasContract: facts.hasContract,
    contract: facts.hasContract
      ? {
          monthlyLimitG: facts.monthlyLimitG,
        }
      : null,
    expired: facts.expired,
    canWithdraw,
    reasons: {
      inactive: !facts.active,
      noContract: !facts.hasContract,
      expired: facts.expired,
    },
  });
}
