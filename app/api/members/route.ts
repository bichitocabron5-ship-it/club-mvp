// app/api/members/route.ts
import { requireAuth, requireStaffOrAdmin } from "@/lib/auth-server";
import { Prisma } from "@prisma/client";
import {
  MEMBER_IDENTITY_MAX_INPUT_LENGTH,
  normalizeMemberIdentity,
} from "@/lib/member-identity";
import {
  getNextMemberNumber,
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
  dni: z.string().max(MEMBER_IDENTITY_MAX_INPUT_LENGTH),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
  expiresAt: z.string().optional().nullable().or(z.literal("")),
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

  const result = members.map((member) => {
    const { contracts, ...memberData } = member;

    return {
      ...memberData,
      photoUrl: null,
      hasPhoto: Boolean(member.photoUrl),
      dniFrontUrl: null,
      dniBackUrl: null,
      hasContract: contracts.length > 0,
    };
  });

  return NextResponse.json(result);
}

type MemberConflictField = "dni" | "memberNumber" | "rfidCode";

class MemberCreateConflict extends Error {
  constructor(readonly field: MemberConflictField) {
    super("Member unique conflict");
  }
}

// Match only the known single-column Member constraints, never error messages.
function classifyMemberCreateError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    for (const field of ["dni", "memberNumber", "rfidCode"] as const) {
      if ((Array.isArray(target) && target.length === 1 && target[0] === field) ||
          target === field || target === `Member_${field}_key`) {
        throw new MemberCreateConflict(field);
      }
    }
  }
  throw error;
}

function truncateAuditString(value: string) {
  return value.length > 500 ? `${value.slice(0, 497)}...` : value;
}

export async function POST(req: Request) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return NextResponse.json({ code: "INVALID_PAYLOAD", error: "JSON invalido" }, { status: 400 });
    }
    const parsed = memberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }

    const normalizedMemberNumber = normalizeMemberNumber(parsed.data.memberNumber);
    const validatedMemberNumber = validateMemberNumber(normalizedMemberNumber);
    const normalizedDni = normalizeMemberIdentity(parsed.data.dni);
    const normalizedRfidCode =
      parsed.data.rfidCode === undefined || parsed.data.rfidCode === null
        ? undefined
        : normalizeRfidCode(parsed.data.rfidCode);

    if (!validatedMemberNumber.ok) {
      return NextResponse.json({ error: validatedMemberNumber.error }, { status: 400 });
    }

    if (!normalizedDni) {
      return NextResponse.json(
        { error: "Documento de identidad invalido" },
        { status: 400 }
      );
    }

    if (typeof parsed.data.rfidCode === "string" && !normalizedRfidCode) {
      return NextResponse.json({ error: "Codigo RFID invalido" }, { status: 400 });
    }

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ code: "INVALID_PAYLOAD", error: "Fecha invalida" }, { status: 400 });
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
      dni: normalizedDni,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      active: isAdmin ? (parsed.data.active ?? true) : true,
      expiresAt,
      rfidCode: normalizedRfidCode ?? null,
      commercialProfile: isAdmin ? parsed.data.commercialProfile : undefined,
      discountPercent: isAdmin ? parsed.data.discountPercent : undefined,
      commercialNotes: isAdmin
        ? parsed.data.commercialNotes === ""
          ? null
          : parsed.data.commercialNotes
        : undefined,
    };

    const explicitNumber = validatedMemberNumber.value;
    const actorUserId = Number(auth.session.user.id);
    for (let attempt = 0; attempt < (explicitNumber ? 1 : 5); attempt += 1) {
      try {
        const member = await prisma.$transaction(async (tx) => {
          const memberNumber = explicitNumber ?? await getNextMemberNumber(tx);
          // Only this write can produce a domain conflict or a number retry.
          const created = await tx.member.create({
            data: { ...baseData, memberNumber },
          }).catch(classifyMemberCreateError);

          // Mandatory audit: any failure escapes and rolls back the whole attempt.
          await tx.auditLog.create({
            data: {
              actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
              actorEmail: auth.session.user.email?.trim().toLowerCase() || null,
              action: "MEMBER_CREATED",
              entityType: "Member",
              entityId: String(created.id),
              summary: truncateAuditString(`Socio creado #${created.memberNumber ?? created.id}`.trim()),
              metadata: {
                memberNumber: created.memberNumber === null ? null : truncateAuditString(created.memberNumber),
                active: created.active,
                hasExpiration: Boolean(created.expiresAt),
                hasRfid: Boolean(created.rfidCode),
              },
            },
          });
          return created;
        });
        return NextResponse.json(member);
      } catch (error) {
        if (!explicitNumber && error instanceof MemberCreateConflict && error.field === "memberNumber") {
          continue;
        }
        throw error;
      }
    }
    return NextResponse.json(
      { code: "MEMBER_NUMBER_GENERATION_CONFLICT", error: "No se pudo asignar un numero de socio unico. Reintenta." },
      { status: 409 }
    );
  } catch (error) {
    if (error instanceof MemberCreateConflict) {
      const conflicts = {
        dni: { code: "DNI_ALREADY_EXISTS", error: "No se pudo crear. El DNI ya existe." },
        memberNumber: { code: "MEMBER_NUMBER_ALREADY_EXISTS", error: "El numero de socio ya existe." },
        rfidCode: { code: "RFID_ALREADY_ASSIGNED", error: "Esta chapita ya esta asignada a otro socio" },
      };
      return NextResponse.json(conflicts[error.field], { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el socio." }, { status: 500 });
  }
}
