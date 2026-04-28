// app/api/members/[id]/contracts/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memberId = Number(id);

  const contracts = await prisma.memberContract.findMany({
    where: { memberId },
    orderBy: { signedAt: "desc" },
  });

  return NextResponse.json(contracts);
}