// app/api/signing-sessions/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { findActiveContractTemplate } from "@/lib/contract-templates";
import { prisma } from "@/lib/prisma";
import {
  getSigningSessionExpiresAt,
  serializeInternalSigningSession,
} from "@/lib/signing-session";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const memberId = Number(body.memberId);

  if (!memberId) {
    return NextResponse.json({ error: "Socio inválido" }, { status: 400 });
  }

  const contractTemplate = await findActiveContractTemplate();

  if (!contractTemplate) {
    return NextResponse.json(
      { error: "No hay plantilla de contrato activa configurada" },
      { status: 400 }
    );
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

  const payload = await serializeInternalSigningSession(
    {
      ...session,
      contract: null,
    },
    req
  );

  if (!payload) {
    return NextResponse.json(
      { error: "No se pudo crear la sesion de firma" },
      { status: 500 }
    );
  }

  return NextResponse.json(payload);
}
