import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CurrentInsideMember = {
  id: number;
  memberNumber: string | null;
  displayNumber: string;
  fullName: string;
  dni: string;
  photoUrl: string | null;
  active: boolean;
  expiresAt: string | null;
  rfidCode: string | null;
  lastAccessType: "IN" | "OUT" | string;
  lastAccessAt: string;
};

type AccessReader = Pick<PrismaClient, "member"> | Prisma.TransactionClient;

export async function getCurrentInsideMembers(
  db: AccessReader = prisma
): Promise<CurrentInsideMember[]> {
  const members = await db.member.findMany({
    select: {
      id: true,
      memberNumber: true,
      fullName: true,
      dni: true,
      photoUrl: true,
      active: true,
      expiresAt: true,
      rfidCode: true,
      accessLogs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      fullName: "asc",
    },
  });

  return members
    .filter((member) => member.accessLogs[0]?.type === "IN")
    .map((member) => ({
      id: member.id,
      memberNumber: member.memberNumber,
      displayNumber: member.memberNumber ?? String(member.id),
      fullName: member.fullName,
      dni: member.dni,
      photoUrl: member.photoUrl,
      active: member.active,
      expiresAt: member.expiresAt?.toISOString() ?? null,
      rfidCode: member.rfidCode,
      lastAccessType: member.accessLogs[0]?.type ?? "",
      lastAccessAt: member.accessLogs[0]?.createdAt.toISOString() ?? "",
    }));
}
