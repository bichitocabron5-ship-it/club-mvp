// app/api/admin/users/route.ts
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  appUserPublicSelect,
  assertEmailAvailable,
  assertMemberLinkAvailable,
} from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "STAFF"]),
  memberId: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: "desc" },
    select: appUserPublicSelect,
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await assertEmailAvailable(email);
    await assertMemberLinkAvailable(parsed.data.memberId ?? null);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const user = await prisma.appUser.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash,
        role: parsed.data.role,
        active: true,
        memberId: parsed.data.memberId ?? null,
      },
      select: appUserPublicSelect,
    });

    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "INTERNAL_USER_CREATED",
      entityType: "AppUser",
      entityId: user.id,
      summary: `Usuario interno creado: ${user.email}`,
      metadata: {
        role: user.role,
        active: user.active,
        memberId: user.memberId,
      },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "No se pudo crear. Revisa si el email ya existe." },
      { status: 400 }
    );
  }
}
