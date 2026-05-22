import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type CurrentInsideMember = {
  id: number;
  fullName: string;
  dni: string;
  lastAccessAt: string;
};

type AccessReader = Pick<PrismaClient, "member"> | Prisma.TransactionClient;

export async function getCurrentInsideMembers(
  db: AccessReader = prisma
): Promise<CurrentInsideMember[]> {
  const members = await db.member.findMany({
    include: {
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
      fullName: member.fullName,
      dni: member.dni,
      lastAccessAt: member.accessLogs[0]?.createdAt.toISOString() ?? "",
    }));
}
