import { isSigningSessionExpired } from "@/lib/signing-session";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const tokenSchema = z.string().trim().regex(/^[a-f0-9]{48}$/i);

const signPayloadSchema = z.object({
  signatureImage: z.string().trim().regex(/^data:image\/png;base64,/),
  form: z
    .object({
      fullName: z.string().trim().optional(),
      dni: z.string().trim().optional(),
      address: z.string().trim().optional(),
      birthPlace: z.string().trim().optional(),
      birthDate: z.string().trim().optional(),
      phone: z.string().trim().optional(),
      email: z.string().trim().optional(),
      consumptionGrams: z.union([z.string().trim(), z.number()]).optional(),
    })
    .optional(),
});

async function getPublicSigningSession(token: string) {
  const parsedToken = tokenSchema.safeParse(token);

  if (!parsedToken.success) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Token inválido" }, { status: 400 }),
    };
  }

  const session = await prisma.signingSession.findUnique({
    where: { token: parsedToken.data },
    include: {
      member: true,
      contract: true,
    },
  });

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Sesión no encontrada" },
        { status: 404 }
      ),
    };
  }

  if (isSigningSessionExpired(session.expiresAt)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "La sesión de firma ha caducado" },
        { status: 410 }
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await getPublicSigningSession(token);

  if (!result.ok) {
    return result.response;
  }

  return NextResponse.json(result.session);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const sessionResult = await getPublicSigningSession(token);

  if (!sessionResult.ok) {
    return sessionResult.response;
  }

  const existingSession = sessionResult.session;

  if (existingSession.status === "SIGNED" && existingSession.contract) {
    return NextResponse.json(existingSession);
  }

  const body = await req.json();
  const parsedBody = signPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const form = parsedBody.data.form || {};

  const session = await prisma.$transaction(async (tx) => {
    const updatedSession = await tx.signingSession.update({
      where: { token },
      data: {
        status: "SIGNED",
        signatureImage: parsedBody.data.signatureImage,
        signedAt: new Date(),
      },
      include: {
        member: true,
      },
    });

    await tx.memberContract.create({
      data: {
        memberId: updatedSession.memberId,
        signingSessionId: updatedSession.id,

        fullName: form.fullName || updatedSession.member.fullName,
        dni: form.dni || updatedSession.member.dni,
        address: form.address || null,
        birthPlace: form.birthPlace || null,
        birthDate: form.birthDate ? new Date(form.birthDate) : null,
        phone: form.phone || updatedSession.member.phone || null,
        email: form.email || null,
        consumptionGrams: form.consumptionGrams
          ? Number(form.consumptionGrams)
          : null,

        signatureImage: parsedBody.data.signatureImage,
      },
    });

    return tx.signingSession.findUnique({
      where: { token },
      include: {
        member: true,
        contract: true,
      },
    });
  });

  return NextResponse.json(session);
}
