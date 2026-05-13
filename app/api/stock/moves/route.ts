// app/api/stock/moves/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
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