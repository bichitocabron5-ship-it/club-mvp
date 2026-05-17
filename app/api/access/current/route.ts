// app/api/access/current/route.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type MemberWithAccessLog = Prisma.MemberGetPayload<{
  include: {
    accessLogs: {
      take: 1;
      orderBy: {
        createdAt: "desc";
      };
    };
  };
}>;

export async function GET() {
  const members = await prisma.member.findMany({
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

  const inside = members
    .filter((member: MemberWithAccessLog) => member.accessLogs[0]?.type === "IN")
    .map((member: MemberWithAccessLog) => ({
      id: member.id,
      fullName: member.fullName,
      dni: member.dni,
      lastAccessAt: member.accessLogs[0]?.createdAt,
    }));

  return NextResponse.json({
    count: inside.length,
    inside,
  });
}