// app/api/members/route.ts
import { requireAuth, requireStaffOrAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  getNextMemberNumber,
  isUniqueConstraintError,
  normalizeMemberNumber,
  validateMemberNumber,
} from "@/lib/member-number";
import { prisma } from "@/lib/prisma";
import { normalizeRfidCode } from "@/lib/rfid";
import { NextResponse } from "next/server";
import { z } from "zod";

const memberSchema = z.object({
  memberNumber: z.string().trim().optional().nullable().or(z.literal("")),
  fullName: z.string().trim().min(1),
  dni: z.string().trim().min(1),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
  expiresAt: z.string().optional().or(z.literal("")),
  rfidCode: z.string().optional().nullable(),
  commercialProfile: z.string().trim().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  commercialNotes: z.string().trim().optional().nullable(),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const members = await prisma.member.findMany({
    include: {
      contracts: {
        take: 1,
        orderBy: {
          signedAt: "desc",
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = members.map((member) => ({
    ...member,
    hasContract: member.contracts.length > 0,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = memberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const normalizedMemberNumber = normalizeMemberNumber(parsed.data.memberNumber);
  const validatedMemberNumber = validateMemberNumber(normalizedMemberNumber);
  const normalizedRfidCode =
    parsed.data.rfidCode === undefined || parsed.data.rfidCode === null
      ? undefined
      : normalizeRfidCode(parsed.data.rfidCode);

  if (!validatedMemberNumber.ok) {
    return NextResponse.json({ error: validatedMemberNumber.error }, { status: 400 });
  }

  if (parsed.data.rfidCode !== undefined && !normalizedRfidCode) {
    return NextResponse.json({ error: "Codigo RFID invalido" }, { status: 400 });
  }

  const isAdmin = auth.session.user.role === "ADMIN";

  if (!isAdmin) {
    const forbiddenFields: string[] = [];

    if (parsed.data.active === false) {
      forbiddenFields.push("active");
    }
    if (
      parsed.data.commercialProfile !== undefined &&
      parsed.data.commercialProfile !== "STANDARD"
    ) {
      forbiddenFields.push("commercialProfile");
    }
    if (
      parsed.data.discountPercent !== undefined &&
      parsed.data.discountPercent !== 0
    ) {
      forbiddenFields.push("discountPercent");
    }
    if (
      parsed.data.commercialNotes !== undefined &&
      (parsed.data.commercialNotes ?? "").trim() !== ""
    ) {
      forbiddenFields.push("commercialNotes");
    }

    if (forbiddenFields.length > 0) {
      return NextResponse.json(
        {
          error: `No tienes permiso para definir estos campos: ${forbiddenFields.join(", ")}`,
        },
        { status: 403 }
      );
    }
  }

  const baseData = {
    memberNumber: validatedMemberNumber.value ?? undefined,
    fullName: parsed.data.fullName,
    dni: parsed.data.dni,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    active: isAdmin ? (parsed.data.active ?? true) : true,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    rfidCode: normalizedRfidCode ?? null,
    commercialProfile: isAdmin ? parsed.data.commercialProfile : undefined,
    discountPercent: isAdmin ? parsed.data.discountPercent : undefined,
    commercialNotes: isAdmin
      ? parsed.data.commercialNotes === ""
        ? null
        : parsed.data.commercialNotes
      : undefined,
  };

  try {
    if (validatedMemberNumber.value) {
      const member = await prisma.member.create({
        data: baseData,
      });

      await createAuditLog({
        actorUserId: Number(auth.session.user.id),
        actorEmail: auth.session.user.email,
        action: "MEMBER_CREATED",
        entityType: "Member",
        entityId: member.id,
        summary: `Socio creado #${member.memberNumber ?? member.id}`,
        metadata: {
          memberNumber: member.memberNumber,
          active: member.active,
          hasExpiration: Boolean(member.expiresAt),
          hasRfid: Boolean(member.rfidCode),
        },
      });

      return NextResponse.json(member);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const member = await prisma.$transaction(async (tx) => {
          const memberNumber = await getNextMemberNumber(tx);

          return tx.member.create({
            data: {
              ...baseData,
              memberNumber,
            },
          });
        });

        await createAuditLog({
          actorUserId: Number(auth.session.user.id),
          actorEmail: auth.session.user.email,
          action: "MEMBER_CREATED",
          entityType: "Member",
          entityId: member.id,
          summary: `Socio creado #${member.memberNumber ?? member.id}`,
          metadata: {
            memberNumber: member.memberNumber,
            active: member.active,
            hasExpiration: Boolean(member.expiresAt),
            hasRfid: Boolean(member.rfidCode),
          },
        });

        return NextResponse.json(member);
      } catch (error) {
        if (isUniqueConstraintError(error, "memberNumber")) {
          continue;
        }

        if (isUniqueConstraintError(error, "dni")) {
          return NextResponse.json(
            { error: "No se pudo crear. El DNI ya existe." },
            { status: 400 }
          );
        }

        throw error;
      }
    }

    return NextResponse.json(
      { error: "No se pudo asignar un numero de socio unico. Reintenta." },
      { status: 409 }
    );
  } catch (error) {
    if (isUniqueConstraintError(error, "memberNumber")) {
      return NextResponse.json(
        { error: "El numero de socio ya existe." },
        { status: 400 }
      );
    }

    if (isUniqueConstraintError(error, "dni")) {
      return NextResponse.json(
        { error: "No se pudo crear. El DNI ya existe." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear el socio." },
      { status: 500 }
    );
  }
}
