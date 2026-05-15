// app/api/members/[id]/access-logs/route.ts
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

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const logs = await prisma.accessLog.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(logs);
}
