import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const moves = await prisma.cashMove.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(moves);
}

export async function POST(req: Request) {
  const body = await req.json();

  const move = await prisma.cashMove.create({
    data: {
      type: body.type,
      amount: Number(body.amount),
      note: body.note || null,
    },
  });

  return NextResponse.json(move);
}