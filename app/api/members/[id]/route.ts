// app/api/members/[id]/route.ts
import { requireAuth } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  isUniqueConstraintError,
  normalizeMemberNumber,
  validateMemberNumber,
} from "@/lib/member-number";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const adminOnlyFields = [
  "memberNumber",
  "fullName",
  "dni",
  "expiresAt",
  "rfidCode",
  "commercialProfile",
  "discountPercent",
  "commercialNotes",
] as const;

const memberUpdateSchema = z.object({
  memberNumber: z.string().trim().optional().nullable(),
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

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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
  const normalizedMemberNumber = normalizeMemberNumber(data.memberNumber);
  const validatedMemberNumber = validateMemberNumber(normalizedMemberNumber);

  if (!validatedMemberNumber.ok) {
    return NextResponse.json({ error: validatedMemberNumber.error }, { status: 400 });
  }

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
      (normalizedMemberNumber !== undefined &&
        normalizedMemberNumber !== (existingMember.memberNumber ?? "")) ||
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
        memberNumber: isAdmin
          ? validatedMemberNumber.value === null
            ? undefined
            : validatedMemberNumber.value
          : undefined,
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

    const changedFields: string[] = [];

    if (member.memberNumber !== existingMember.memberNumber) {
      changedFields.push("memberNumber");
    }
    if (member.fullName !== existingMember.fullName) {
      changedFields.push("fullName");
    }
    if (member.dni !== existingMember.dni) {
      changedFields.push("dni");
    }
    if (trimToNull(member.phone) !== trimToNull(existingMember.phone)) {
      changedFields.push("phone");
    }
    if (trimToNull(member.email) !== trimToNull(existingMember.email)) {
      changedFields.push("email");
    }
    if (
      (member.expiresAt?.toISOString() ?? null) !==
      (existingMember.expiresAt?.toISOString() ?? null)
    ) {
      changedFields.push("expiresAt");
    }
    if (member.commercialProfile !== existingMember.commercialProfile) {
      changedFields.push("commercialProfile");
    }
    if (Number(member.discountPercent) !== Number(existingMember.discountPercent)) {
      changedFields.push("discountPercent");
    }
    if (
      trimToNull(member.commercialNotes) !== trimToNull(existingMember.commercialNotes)
    ) {
      changedFields.push("commercialNotes");
    }
    if (trimToNull(member.rfidCode) !== trimToNull(existingMember.rfidCode)) {
      changedFields.push("rfidCode");
    }

    if (changedFields.length > 0) {
      const actorUserId = Number(auth.session.user.id);
      const actorEmail = auth.session.user.email;
      const generalFields = changedFields.filter(
        (field) =>
          field !== "commercialProfile" &&
          field !== "discountPercent" &&
          field !== "commercialNotes" &&
          field !== "rfidCode"
      );

      if (generalFields.length > 0) {
        await createAuditLog({
          actorUserId,
          actorEmail,
          action: "MEMBER_UPDATED",
          entityType: "Member",
          entityId: member.id,
          summary: `Socio actualizado #${member.memberNumber ?? member.id}`,
          metadata: {
            changedFields: generalFields,
          },
        });
      }

      if (
        changedFields.includes("commercialProfile") ||
        changedFields.includes("discountPercent") ||
        changedFields.includes("commercialNotes")
      ) {
        await createAuditLog({
          actorUserId,
          actorEmail,
          action: "MEMBER_COMMERCIAL_UPDATED",
          entityType: "Member",
          entityId: member.id,
          summary: `Perfil comercial actualizado para socio #${member.memberNumber ?? member.id}`,
          metadata: {
            commercialProfile: member.commercialProfile,
            discountPercent: Number(member.discountPercent),
            notesUpdated: changedFields.includes("commercialNotes"),
          },
        });
      }

      if (changedFields.includes("rfidCode")) {
        await createAuditLog({
          actorUserId,
          actorEmail,
          action: "MEMBER_RFID_UPDATED",
          entityType: "Member",
          entityId: member.id,
          summary: `RFID actualizado para socio #${member.memberNumber ?? member.id}`,
          metadata: {
            hadRfid: Boolean(existingMember.rfidCode),
            hasRfid: Boolean(member.rfidCode),
          },
        });
      }
    }

    return NextResponse.json(member);
  } catch (error) {
    if (isUniqueConstraintError(error, "memberNumber")) {
      return NextResponse.json(
        { error: "El numero de socio ya existe." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar. Revisa numero de socio, DNI o RFID duplicados." },
      { status: 400 }
    );
  }
}
