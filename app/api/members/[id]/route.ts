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
  commercialProfile: z.string().trim().min(1).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  commercialNotes: z.string().trim().optional().nullable(),
});

class RfidAlreadyAssignedError extends Error {}

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
    return NextResponse.json({ code: "INVALID_PAYLOAD", error: "JSON invalido" }, { status: 400 });
  }

  // Inspect the original JSON before Zod can strip unknown editable fields.
  if (body && typeof body === "object" &&
      ("rfidCode" in body || "expectedRfidCode" in body)) {
    const parsedRfid = z.object({
      rfidCode: z.string().nullable(),
      expectedRfidCode: z.string().nullable(),
    }).strict().safeParse(body);
    if (!parsedRfid.success) {
      return NextResponse.json({ code: "INVALID_PAYLOAD", error: "RFID requiere destino y precondicion, sin otros campos" }, { status: 400 });
    }
    const destination = parsedRfid.data.rfidCode === null ? null : normalizeRfidCode(parsedRfid.data.rfidCode);
    const expected = parsedRfid.data.expectedRfidCode === null ? null : normalizeRfidCode(parsedRfid.data.expectedRfidCode);
    if (destination === "" || expected === "") {
      return NextResponse.json({ code: "INVALID_PAYLOAD", error: "Codigo RFID invalido" }, { status: 400 });
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Exact no-ops do not write. All transitions use the expected-state predicate.
        const updated = expected === destination ? { count: 0 } : await tx.member.updateMany({
          where: { id: memberId, rfidCode: expected },
          data: { rfidCode: destination },
        }).catch((error: unknown) => {
          // Only a unique error from this Member write can mean duplicate RFID.
          if (isUniqueConstraintError(error, "rfidCode")) throw new RfidAlreadyAssignedError();
          throw error;
        });
        const member = await tx.member.findUnique({ where: { id: memberId } });
        if (!member) return { status: 404, body: { code: "MEMBER_NOT_FOUND", error: "Socio no encontrado" } };
        if (updated.count === 0) {
          return (member.rfidCode === expected && expected === destination) ||
            (member.rfidCode === null && destination === null)
            ? { status: 200, body: member }
            : { status: 409, body: { code: "RFID_EXPECTATION_FAILED", error: "La RFID del socio cambio desde la confirmacion" } };
        }
        const actorUserId = Number(auth.session.user.id);
        await tx.auditLog.create({
          data: {
            actorUserId: Number.isSafeInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
            actorEmail: auth.session.user.email?.trim().toLowerCase() || null,
            action: "MEMBER_RFID_UPDATED",
            entityType: "Member",
            entityId: String(member.id),
            summary: `RFID actualizado para socio #${member.id}`,
            metadata: {
              operation: destination === null ? "UNASSIGN" : expected === null ? "ASSIGN" : "CHANGE",
              hadRfid: expected !== null,
              hasRfid: destination !== null,
            },
          },
        });
        return { status: 200, body: member };
      });
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      if (error instanceof RfidAlreadyAssignedError) {
        return NextResponse.json({ code: "RFID_ALREADY_ASSIGNED", error: "Esta chapita ya esta asignada a otro socio" }, { status: 409 });
      }
      return NextResponse.json({ error: "No se pudo actualizar la RFID" }, { status: 500 });
    }
  }
  const parsed = memberUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const data = parsed.data;
  const normalizedMemberNumber = normalizeMemberNumber(data.memberNumber);
  const validatedMemberNumber = validateMemberNumber(normalizedMemberNumber);
  const normalizedDni =
    data.dni === undefined ? undefined : normalizeMemberIdentity(data.dni);
  const normalizedExpiresAt = normalizeDateOnly(data.expiresAt);
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
          data.memberNumber !== undefined
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
