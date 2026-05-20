// app/api/members/[id]/contracts/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  const contracts = await prisma.memberContract.findMany({
    where: { memberId },
    include: {
      contractTemplate: true,
    },
    orderBy: { signedAt: "desc" },
  });

  return NextResponse.json(contracts);
}
