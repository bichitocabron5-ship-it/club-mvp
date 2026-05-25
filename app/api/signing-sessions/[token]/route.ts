import type { Prisma } from "@prisma/client";
import { ensureSignedContractPdf } from "@/lib/contract-pdf";
import {
  findActiveContractTemplate,
  resolveContractTemplateForContract,
} from "@/lib/contract-templates";
import { getClubSettings } from "@/lib/club-settings";
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

type SigningSessionWithRelations = Prisma.SigningSessionGetPayload<{
  include: {
    member: true;
    contract: true;
  };
}>;

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

async function serializeSigningSession(
  session: SigningSessionWithRelations | null
) {
  if (!session) {
    return null;
  }

  const contractTemplate = session.contract?.contractTemplateId
    ? await resolveContractTemplateForContract(session.contract.contractTemplateId)
    : await findActiveContractTemplate();
  const settings = await getClubSettings();

  return {
    ...session,
    contractTemplate,
    clubSettings: {
      defaultMonthlyLimitG: settings.defaultMonthlyLimitG,
    },
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

  const payload = await serializeSigningSession(result.session);

  if (!payload?.contractTemplate && payload?.status !== "SIGNED") {
    return NextResponse.json(
      { error: "No hay plantilla de contrato activa configurada" },
      { status: 400 }
    );
  }

  return NextResponse.json(payload);
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
    if (!existingSession.contract.signedPdfUrl) {
      await ensureSignedContractPdf(existingSession.contract.id);
    }

    const refreshedSession = await prisma.signingSession.findUnique({
      where: { token },
      include: {
        member: true,
        contract: true,
      },
    });

    return NextResponse.json(await serializeSigningSession(refreshedSession));
  }

  const contractTemplate = await findActiveContractTemplate();

  if (!contractTemplate) {
    return NextResponse.json(
      { error: "No hay plantilla de contrato activa configurada" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsedBody = signPayloadSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const form = parsedBody.data.form || {};
  const mergedFullName = form.fullName || existingSession.member.fullName;
  const mergedDni = form.dni || existingSession.member.dni;
  const mergedPhone = form.phone || existingSession.member.phone || null;
  const mergedEmail = form.email || existingSession.member.email || null;

  const session = await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: existingSession.memberId },
      data: {
        fullName: mergedFullName,
        dni: mergedDni,
        phone: mergedPhone,
        email: mergedEmail,
      },
    });

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

    const createdContract = await tx.memberContract.create({
      data: {
        memberId: updatedSession.memberId,
        signingSessionId: updatedSession.id,
        contractTemplateId: contractTemplate.id,

        fullName: mergedFullName,
        dni: mergedDni,
        address: form.address || null,
        birthPlace: form.birthPlace || null,
        birthDate: form.birthDate ? new Date(form.birthDate) : null,
        phone: mergedPhone,
        email: mergedEmail,
        consumptionGrams: form.consumptionGrams
          ? Number(form.consumptionGrams)
          : null,

        signatureImage: parsedBody.data.signatureImage,
      },
    });

    return {
      contractId: createdContract.id,
    };
  });

  await ensureSignedContractPdf(session.contractId);

  const refreshedSession = await prisma.signingSession.findUnique({
    where: { token },
    include: {
      member: true,
      contract: true,
    },
  });

  return NextResponse.json(await serializeSigningSession(refreshedSession));
}
