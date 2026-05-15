// app/api/members/[id]/contracts/route.ts
import { requireAuth } from "@/lib/auth-server";
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

  const contracts = await prisma.memberContract.findMany({
    where: { memberId },
    orderBy: { signedAt: "desc" },
  });

  return NextResponse.json(contracts);
}
