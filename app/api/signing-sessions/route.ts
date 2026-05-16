// app/api/signing-sessions/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getSigningSessionExpiresAt } from "@/lib/signing-session";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
      expiresAt: getSigningSessionExpiresAt(),
    },
    include: {
      member: true,
    },
  });

  return NextResponse.json(session);
}
