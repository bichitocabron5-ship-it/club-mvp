import { requireStaffOrAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  MEMBER_IDENTITY_MAX_INPUT_LENGTH,
  normalizeMemberIdentity,
} from "@/lib/member-identity";
import {
  isUniqueConstraintError,
  normalizeMemberNumber,
  validateMemberNumber,
} from "@/lib/member-number";
import { prisma } from "@/lib/prisma";
import { normalizeRfidCode } from "@/lib/rfid";
import { NextResponse } from "next/server";
import { z } from "zod";

const staffEditableFields = [
  "memberNumber",
  "fullName",
  "dni",
  "phone",
  "email",
  "expiresAt",
  "rfidCode",
] as const;

const adminOnlyFields = [
  "commercialProfile",
  "discountPercent",
  "commercialNotes",
  "active",
] as const;

const memberUpdateSchema = z.object({
  memberNumber: z.string().trim().optional().nullable(),
  fullName: z.string().trim().min(1).optional(),
  dni: z.string().max(MEMBER_IDENTITY_MAX_INPUT_LENGTH).optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  rfidCode: z.string().optional().nullable(),
  expectedRfidCode: z.string().optional(),
  commercialProfile: z.string().trim().min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  commercialNotes: z.string().trim().optional().nullable(),
});

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeDateOnly(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "INVALID";
  return date.toISOString().slice(0, 10);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isSafeInteger(memberId) || memberId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = memberUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.rfidCode === null) {
    const expectedRfidCode = normalizeRfidCode(data.expectedRfidCode ?? "");
    if (
      !expectedRfidCode ||
      Object.keys(body).some((key) => key !== "rfidCode" && key !== "expectedRfidCode")
    ) {
      return NextResponse.json(
        { error: "Desasignar requiere expectedRfidCode valido y no admite otros cambios" },
        { status: 400 }
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // The predicate is checked by the UPDATE, not by an earlier snapshot.
        const updated = await tx.member.updateMany({
          where: { id: memberId, rfidCode: expectedRfidCode },
          data: { rfidCode: null },
        });
        const member = await tx.member.findUnique({ where: { id: memberId } });
        if (!member) return { status: 404, body: { error: "Socio no encontrado" } };
        if (updated.count === 0) {
          return member.rfidCode === null
            ? { status: 200, body: member }
            : { status: 409, body: { error: "La RFID del socio cambio desde la confirmacion" } };
        }

        // Do not use the best-effort helper here: failure must roll back the update.
        const actorUserId = Number(auth.session.user.id);
        await tx.auditLog.create({
          data: {
            actorUserId: Number.isSafeInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
            actorEmail: auth.session.user.email?.trim().toLowerCase() || null,
            action: "MEMBER_RFID_UPDATED",
            entityType: "Member",
            entityId: String(member.id),
            summary: `RFID desasignada para socio #${member.id}`,
            metadata: { operation: "UNASSIGN", hadRfid: true, hasRfid: false },
          },
        });
        return { status: 200, body: member };
      });
      return NextResponse.json(result.body, { status: result.status });
    } catch {
      return NextResponse.json(
        { error: "No se pudo desasignar la RFID" },
        { status: 500 }
      );
    }
  }
  const normalizedMemberNumber = normalizeMemberNumber(data.memberNumber);
  const validatedMemberNumber = validateMemberNumber(normalizedMemberNumber);
  const normalizedDni =
    data.dni === undefined ? undefined : normalizeMemberIdentity(data.dni);
  const normalizedExpiresAt = normalizeDateOnly(data.expiresAt);
  const normalizedRfidCode =
    data.rfidCode === undefined || data.rfidCode === null
      ? undefined
      : normalizeRfidCode(data.rfidCode);

  if (!validatedMemberNumber.ok) {
    return NextResponse.json({ error: validatedMemberNumber.error }, { status: 400 });
  }

  if (normalizedExpiresAt === "INVALID") {
    return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
  }

  if (data.dni !== undefined && !normalizedDni) {
    return NextResponse.json(
      { error: "Documento de identidad invalido" },
      { status: 400 }
    );
  }

  if (data.rfidCode !== undefined && !normalizedRfidCode) {
    return NextResponse.json({ error: "Codigo RFID invalido" }, { status: 400 });
  }

  const existingMember = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!existingMember) {
    return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
  }

  const isAdmin = auth.session.user.role === "ADMIN";

  if (!isAdmin) {
    const currentExpiresAt = existingMember.expiresAt
      ? existingMember.expiresAt.toISOString().slice(0, 10)
      : null;
    const attemptedForbiddenFields: string[] = [];

    if (
      data.commercialProfile !== undefined &&
      data.commercialProfile !== existingMember.commercialProfile
    ) {
      attemptedForbiddenFields.push("commercialProfile");
    }
    if (
      data.discountPercent !== undefined &&
      data.discountPercent !== Number(existingMember.discountPercent || 0)
    ) {
      attemptedForbiddenFields.push("discountPercent");
    }
    if (
      data.commercialNotes !== undefined &&
      trimToNull(data.commercialNotes) !== trimToNull(existingMember.commercialNotes)
    ) {
      attemptedForbiddenFields.push("commercialNotes");
    }
    if (
      "active" in body &&
      typeof body.active === "boolean" &&
      body.active !== existingMember.active
    ) {
      attemptedForbiddenFields.push("active");
    }

    if (attemptedForbiddenFields.length > 0) {
      return NextResponse.json(
        {
          error: `No tienes permiso para modificar estos campos: ${attemptedForbiddenFields.join(", ")}`,
          allowedFields: staffEditableFields,
        },
        { status: 403 }
      );
    }

    if (
      normalizedMemberNumber !== undefined &&
      normalizedMemberNumber !== (existingMember.memberNumber ?? "")
    ) {
      body.memberNumber = normalizedMemberNumber;
    }
    if (
      normalizedExpiresAt !== undefined &&
      normalizedExpiresAt !== currentExpiresAt
    ) {
      body.expiresAt = normalizedExpiresAt;
    }
  }

  try {
    const member = await prisma.member.update({
      where: { id: memberId },
      data: {
        memberNumber:
          validatedMemberNumber.value !== undefined
            ? validatedMemberNumber.value
            : undefined,
        fullName: data.fullName,
        dni: normalizedDni,
        phone: data.phone === "" ? null : data.phone,
        email: data.email === "" ? null : data.email,
        expiresAt:
          normalizedExpiresAt === undefined
            ? undefined
            : normalizedExpiresAt === null
              ? null
              : new Date(normalizedExpiresAt),
        rfidCode: normalizedRfidCode,
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
        (field) => !adminOnlyFields.includes(field as (typeof adminOnlyFields)[number])
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

    if (isUniqueConstraintError(error, "dni")) {
      return NextResponse.json(
        { error: "No se pudo actualizar. El DNI ya existe." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "No se pudo actualizar. Revisa numero de socio, DNI o RFID duplicados.",
      },
      { status: 400 }
    );
  }
}
