// app/api/members/[id]/operational-status/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import type { MemberOperationalStatus } from "@/lib/helpers/sales-cart";
import { composeMemberOperationalStatus, getMemberOperationalFacts } from "@/lib/member-operational-status";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400, headers });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNumber: true,
      fullName: true,
      active: true,
      expiresAt: true,
      rfidCode: true,
      commercialProfile: true,
      discountPercent: true,
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404, headers });
  }

  const contract = await prisma.memberContract.findFirst({
    where: { memberId },
    orderBy: [{ signedAt: "desc" }, { id: "desc" }],
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

  const operational = composeMemberOperationalStatus(facts);

  const response: MemberOperationalStatus = {
    // Identity fallback and commercial fields are consumed by the existing TPV.
    member: {
      id: member.id,
      memberNumber: member.memberNumber,
      fullName: member.fullName,
      active: facts.active,
      expiresAt: facts.expiresAt?.toISOString() ?? null,
      commercialProfile: member.commercialProfile,
      discountPercent: member.discountPercent,
    },
    ...operational,
    contract: facts.hasContract
      ? {
          monthlyLimitG: facts.monthlyLimitG,
        }
      : null,
  };
  return NextResponse.json(response, { headers });
}
