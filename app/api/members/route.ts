// app/api/members/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const memberSchema = z.object({
  fullName: z.string().trim().min(1),
  dni: z.string().trim().min(1),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
  expiresAt: z.string().optional().or(z.literal("")),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const members = await prisma.member.findMany({
    include: {
      contracts: {
        take: 1,
        orderBy: {
          signedAt: "desc",
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = members.map((member) => ({
    ...member,
    hasContract: member.contracts.length > 0,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = memberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const member = await prisma.member.create({
    data: {
      fullName: parsed.data.fullName,
      dni: parsed.data.dni,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      active: parsed.data.active ?? true,
      expiresAt: parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : null,
    },
  });

  return NextResponse.json(member);
}
