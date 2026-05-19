// app/api/members/route.ts
import { requireAuth } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  getNextMemberNumber,
  isUniqueConstraintError,
  normalizeMemberNumber,
  validateMemberNumber,
} from "@/lib/member-number";
import { prisma } from "@/lib/prisma";
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
  const auth = await requireAuth();
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

  if (!validatedMemberNumber.ok) {
    return NextResponse.json({ error: validatedMemberNumber.error }, { status: 400 });
  }

  const baseData = {
    fullName: parsed.data.fullName,
    dni: parsed.data.dni,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    active: parsed.data.active ?? true,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  };

  try {
    if (validatedMemberNumber.value) {
      const member = await prisma.member.create({
        data: {
          ...baseData,
          memberNumber: validatedMemberNumber.value,
        },
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

    return NextResponse.json({ error: "No se pudo crear el socio." }, { status: 500 });
  }
}
