// app/api/stock/moves/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const moves = await prisma.stockMove.findMany({
    include: {
      product: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  });

  return NextResponse.json(moves);
}
