// app/api/access/toggle/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { normalizeRfidCode } from "@/lib/rfid";
import { resolveStorageUrlForResponse } from "@/lib/storage";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type AccessMemberRecord = {
  id: number;
  memberNumber: string | null;
  fullName: string;
  dni: string;
  photoUrl: string | null;
  active: boolean;
  expiresAt: Date | null;
  rfidCode: string | null;
};

async function serializeAccessMember(member: AccessMemberRecord) {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    displayNumber: member.memberNumber ?? String(member.id),
    fullName: member.fullName,
    dni: member.dni,
    photoUrl: await resolveStorageUrlForResponse(member.photoUrl, {
      context: "api/access/toggle",
    }),
    active: member.active,
    expiresAt: member.expiresAt?.toISOString() ?? null,
    rfidCode: member.rfidCode,
  };
}

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}

function isAccessConflict(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;

  const record = error as Record<string, unknown>;
  // Prisma P2034, raw-query SQLSTATE, and adapter-pg's original SQLSTATE.
  if (
    record.code === "P2034" ||
    record.code === "40001" ||
    record.code === "40P01" ||
    record.originalCode === "40001" ||
    record.originalCode === "40P01"
  ) return true;

  return [record.meta, record.cause, record.driverAdapterError].some((cause) =>
    isAccessConflict(cause, depth + 1)
  );
}

export async function POST(req: Request) {
  // Only transaction failures can be reported as a rolled-back conflict.
  let transactionPending = false;

  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) {
      return errorResponse(auth.status, auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", auth.error);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "INVALID_PAYLOAD", "JSON inválido");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(400, "INVALID_PAYLOAD", "Datos inválidos");
    }

    const { memberId, rfidCode } = body as Record<string, unknown>;
    if (
      typeof memberId !== "number" ||
      !Number.isInteger(memberId) ||
      memberId <= 0 ||
      memberId > 2_147_483_647 ||
      typeof rfidCode !== "string"
    ) {
      return errorResponse(400, "INVALID_PAYLOAD", "Socio o código RFID inválido");
    }

    const normalizedRfidCode = normalizeRfidCode(rfidCode);
    if (!normalizedRfidCode) {
      return errorResponse(400, "INVALID_PAYLOAD", "Código RFID inválido");
    }

    transactionPending = true;
    const result = await prisma.$transaction(async (tx) => {
      // The row lock also coordinates with UNASSIGN's conditional UPDATE.
      // Tagged-template values are bound parameters, never SQL concatenation.
      const [member] = await tx.$queryRaw<AccessMemberRecord[]>`
        SELECT "id", "memberNumber", "fullName", "dni", "photoUrl",
               "active", "expiresAt", "rfidCode"
        FROM "Member"
        WHERE "id" = ${memberId}
        FOR UPDATE
      `;

      if (!member) {
        return { status: 404, code: "MEMBER_NOT_FOUND", error: "Socio no encontrado" };
      }
      if (member.rfidCode !== normalizedRfidCode) {
        return { status: 409, code: "RFID_ASSIGNMENT_CHANGED", error: "La chapita ya no está asignada a este socio. No se ha registrado ningún acceso. Vuelve a escanear." };
      }
      if (!member.active) {
        return { status: 409, code: "MEMBER_INACTIVE", error: "Socio inactivo" };
      }

      const hasContract = await tx.memberContract.findFirst({
        where: { memberId },
        select: { id: true },
      });
      if (!hasContract) {
        return { status: 409, code: "CONTRACT_REQUIRED", error: "Contrato no firmado" };
      }
      if (member.expiresAt && member.expiresAt < new Date()) {
        return { status: 409, code: "MEMBERSHIP_EXPIRED", error: "Membresia caducada" };
      }

      const lastLog = await tx.accessLog.findFirst({
        where: { memberId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const nextType = lastLog?.type === "IN" ? "OUT" : "IN";
      // Use the database wall clock after acquiring the lock, not transaction start.
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS "now"
      `;
      // TIMESTAMP(3) needs a full millisecond to remain strictly increasing.
      const createdAt = new Date(
        lastLog
          ? Math.max(clock.now.getTime(), lastLog.createdAt.getTime() + 1)
          : clock.now.getTime()
      );
      const log = await tx.accessLog.create({
        data: {
          memberId,
          type: nextType,
          createdAt,
        },
      });
      return { member, log, nextType };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    transactionPending = false;

    if (result.status !== undefined) {
      return errorResponse(result.status, result.code, result.error);
    }

    const { member, log, nextType } = result;
    const responseMember = await serializeAccessMember(member);
    return NextResponse.json({
      log: {
        id: log.id,
        memberId: log.memberId,
        type: log.type,
        createdAt: log.createdAt.toISOString(),
      },
      action: nextType,
      message: nextType === "IN" ? "Entrada registrada" : "Salida registrada",
      member: responseMember,
      lastAccess: {
        id: log.id,
        type: log.type,
        createdAt: log.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (transactionPending && isAccessConflict(error)) {
      return errorResponse(409, "ACCESS_CONFLICT", "Conflicto de acceso. Comprueba el estado antes de volver a escanear.");
    }
    return errorResponse(500, "INTERNAL_ERROR", "No se pudo confirmar el resultado del acceso. Comprueba el estado antes de repetir.");
  }
}
