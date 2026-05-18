// app/api/members/[id]/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const adminOnlyFields = [
  "fullName",
  "dni",
  "expiresAt",
  "rfidCode",
  "commercialProfile",
  "discountPercent",
  "commercialNotes",
] as const;

const memberUpdateSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  dni: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  rfidCode: z.string().trim().optional().nullable(),
  commercialProfile: z.string().trim().min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  commercialNotes: z.string().trim().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);
  const body = await req.json();

  if (!memberId || Number.isNaN(memberId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const parsed = memberUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const existingMember = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!existingMember) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const isAdmin = auth.session.user.role === "ADMIN";

  if (!isAdmin) {
    const normalizedExpiresAt =
      data.expiresAt === undefined
        ? undefined
        : data.expiresAt === null || data.expiresAt === ""
          ? null
          : new Date(data.expiresAt).toISOString().slice(0, 10);

    const currentExpiresAt = existingMember.expiresAt
      ? existingMember.expiresAt.toISOString().slice(0, 10)
      : null;

    const attemptedSensitiveChange =
      (data.fullName !== undefined && data.fullName !== existingMember.fullName) ||
      (data.dni !== undefined && data.dni !== existingMember.dni) ||
      (data.rfidCode !== undefined &&
        (data.rfidCode === "" ? null : data.rfidCode) !== existingMember.rfidCode) ||
      (normalizedExpiresAt !== undefined && normalizedExpiresAt !== currentExpiresAt) ||
      (data.commercialProfile !== undefined &&
        data.commercialProfile !== existingMember.commercialProfile) ||
      (data.discountPercent !== undefined &&
        data.discountPercent !== Number(existingMember.discountPercent || 0)) ||
      (data.commercialNotes !== undefined &&
        (data.commercialNotes === "" ? null : data.commercialNotes) !==
          existingMember.commercialNotes);

    if (attemptedSensitiveChange) {
      return NextResponse.json(
        { error: `FORBIDDEN_FIELDS:${adminOnlyFields.join(",")}` },
        { status: 403 }
      );
    }
  }

  try {
    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        fullName: isAdmin ? data.fullName : undefined,
        dni: isAdmin ? data.dni : undefined,
        phone: data.phone === "" ? null : data.phone,
        email: data.email === "" ? null : data.email,
        expiresAt: isAdmin
          ? data.expiresAt
            ? new Date(data.expiresAt)
            : data.expiresAt === null
              ? null
              : undefined
          : undefined,
        rfidCode: isAdmin
          ? data.rfidCode === ""
            ? null
            : data.rfidCode
          : undefined,
        commercialProfile: isAdmin ? data.commercialProfile : undefined,
        discountPercent: isAdmin ? data.discountPercent : undefined,
        commercialNotes: isAdmin
          ? data.commercialNotes === ""
            ? null
            : data.commercialNotes
          : undefined,
      },
    });

    return NextResponse.json(member);
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar. Revisa DNI/RFID duplicados." },
      { status: 400 }
    );
  }
}
