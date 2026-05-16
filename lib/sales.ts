import { prisma } from "@/lib/prisma";
import type { ProductUnit } from "@/lib/types";
import {
  DAILY_LIMIT_G,
  DAILY_LIMIT_UD,
  getDailyTotals,
  getTodayRange,
  normalizeUnit,
} from "@/lib/sales-rules";

export {
  DAILY_LIMIT_G,
  DAILY_LIMIT_UD,
  getDailyTotals,
  getTodayRange,
  normalizeUnit,
  type ProductUnit,
};

export async function getSaleMemberStatus(memberId: number) {
  const [member, contract] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
    }),
    prisma.memberContract.findFirst({
      where: { memberId },
      select: { id: true },
    }),
  ]);

  if (!member) {
    return { error: "Socio no encontrado", status: 404 as const };
  }

  if (!member.active) {
    return { error: "Socio no activo", status: 400 as const };
  }

  if (member.expiresAt && member.expiresAt < new Date()) {
    return { error: "Membresia caducada", status: 400 as const };
  }

  if (!contract) {
    return { error: "El socio no ha firmado el contrato", status: 400 as const };
  }

  return { member };
}

export function getErrorMessage(
  error: unknown,
  fallback = "Ha ocurrido un error"
) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
