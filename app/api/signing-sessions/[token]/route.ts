// app/api/signing-sessions/[token]/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const session = await prisma.signingSession.findUnique({
    where: { token },
    include: {
      member: true,
      contract: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Sesión no encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();

  const existingSession = await prisma.signingSession.findUnique({
    where: { token },
    include: {
      member: true,
      contract: true,
    },
  });

  if (!existingSession) {
    return NextResponse.json(
      { error: "Sesión no encontrada" },
      { status: 404 }
    );
  }

  if (existingSession.status === "SIGNED" && existingSession.contract) {
    return NextResponse.json(existingSession);
  }

  const form = body.form || {};

  const session = await prisma.$transaction(async (tx) => {
    const updatedSession = await tx.signingSession.update({
      where: { token },
      data: {
        status: "SIGNED",
        signatureImage: body.signatureImage,
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

        signatureImage: body.signatureImage,
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