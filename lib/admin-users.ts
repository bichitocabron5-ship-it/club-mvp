import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const appUserPublicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  memberId: true,
  member: {
    select: {
      id: true,
      fullName: true,
      dni: true,
    },
  },
} satisfies Prisma.AppUserSelect;

export async function ensureActiveAdminRemains(
  userId: number,
  nextRole?: string,
  nextActive?: boolean
) {
  const existingUser = await prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      active: true,
    },
  });

  if (!existingUser) {
    throw new Error("Usuario no encontrado");
  }

  const finalRole = nextRole ?? existingUser.role;
  const finalActive = nextActive ?? existingUser.active;
  const removesActiveAdmin =
    existingUser.role === "ADMIN" &&
    existingUser.active &&
    (finalRole !== "ADMIN" || !finalActive);

  if (!removesActiveAdmin) {
    return existingUser;
  }

  const activeAdmins = await prisma.appUser.count({
    where: {
      role: "ADMIN",
      active: true,
    },
  });

  if (activeAdmins <= 1) {
    throw new Error("No puedes desactivar o degradar el ultimo ADMIN activo");
  }

  return existingUser;
}

export async function assertEmailAvailable(email: string, excludeUserId?: number) {
  const existing = await prisma.appUser.findFirst({
    where: {
      email,
      id: excludeUserId ? { not: excludeUserId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Ya existe un usuario con ese email");
  }
}

export async function assertMemberLinkAvailable(
  memberId: number | null | undefined,
  excludeUserId?: number
) {
  if (!memberId) {
    return;
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  });

  if (!member) {
    throw new Error("Socio vinculado no encontrado");
  }

  const existing = await prisma.appUser.findFirst({
    where: {
      memberId,
      id: excludeUserId ? { not: excludeUserId } : undefined,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error("Ese socio ya esta vinculado a otro usuario");
  }
}
