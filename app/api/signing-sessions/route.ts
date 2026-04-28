// app/api/signing-sessions/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.json();
  const memberId = Number(body.memberId);

  if (!memberId) {
    return NextResponse.json({ error: "Socio inválido" }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const session = await prisma.signingSession.create({
    data: {
      token,
      memberId,
    },
    include: {
      member: true,
    },
  });

  return NextResponse.json(session);
}