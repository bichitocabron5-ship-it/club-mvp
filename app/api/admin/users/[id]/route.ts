// app/api/admin/users/[id]/route.ts
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const userId = Number(id);

  if (!userId || Number.isNaN(userId)) {
    return NextResponse.json({ error: "Usuario inválido" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : undefined;

  const user = await prisma.appUser.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      role: parsed.data.role,
      active: parsed.data.active,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
}