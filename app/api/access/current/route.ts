// app/api/access/current/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

  type MemberWithAccessLog = (typeof members)[number];

  const inside = members
    .filter((member: MemberWithAccessLog) => member.accessLogs[0]?.type === "IN")
    .map((member: MemberWithAccessLog) => ({
      id: member.id,
      fullName: member.fullName,
    }));

  return NextResponse.json({
    count: inside.length,
    inside,
  });
}
