// app/api/members/[id]/status/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memberId = Number(id);
  const body = await req.json();

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const data: {
    active?: boolean;
    expiresAt?: Date | null;
  } = {};

  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  if (body.renewOneYear === true) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    data.expiresAt = expiresAt;
    data.active = true;
  }

  if (body.clearExpiration === true) {
    data.expiresAt = null;
  }

  const member = await prisma.member.update({
    where: { id: memberId },
    data,
  });

  return NextResponse.json(member);
}