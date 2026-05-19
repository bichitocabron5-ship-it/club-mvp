import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType")?.trim();
  const action = url.searchParams.get("action")?.trim();
  const actorEmail = url.searchParams.get("actorEmail")?.trim().toLowerCase();

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: entityType || undefined,
      action: action || undefined,
      actorEmail: actorEmail
        ? {
            contains: actorEmail,
            mode: "insensitive",
          }
        : undefined,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
    include: {
      actorUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json(logs);
}
