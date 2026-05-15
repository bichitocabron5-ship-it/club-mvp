// app/api/cash/route.ts
import { requireAdmin, requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const moves = await prisma.cashMove.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(moves);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
