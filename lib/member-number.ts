import { Prisma, type PrismaClient } from "@prisma/client";

const numericMemberNumberPattern = /^\d+$/;

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export function normalizeMemberNumber(
  value: string | null | undefined
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";

  return value.trim();
}

export function validateMemberNumber(
  value: string | undefined
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: null };
  }

  if (value === "") {
    return { ok: false, error: "El numero de socio no puede estar vacio" };
  }

  return { ok: true, value };
}

export async function getNextMemberNumber(tx: PrismaExecutor) {
  const members = await tx.member.findMany({
    select: {
      memberNumber: true,
    },
  });

  let maxNumericMemberNumber = 0;

  for (const member of members) {
    if (!member.memberNumber || !numericMemberNumberPattern.test(member.memberNumber)) {
      continue;
    }

    const parsedValue = Number(member.memberNumber);

    if (Number.isSafeInteger(parsedValue) && parsedValue > maxNumericMemberNumber) {
      maxNumericMemberNumber = parsedValue;
    }
  }

  return String(maxNumericMemberNumber + 1);
}

export function isUniqueConstraintError(
  error: unknown,
  fieldName?: string
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  if (!fieldName) {
    return true;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes(fieldName);
  }

  return typeof target === "string" && target.includes(fieldName);
}
