import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const members = await prisma.member.findMany({
    orderBy: {
      fullName: "asc",
    },
    select: {
      id: true,
      fullName: true,
      dni: true,
      appUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json(members);
}
