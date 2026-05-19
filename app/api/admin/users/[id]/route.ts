import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  appUserPublicSelect,
  assertEmailAvailable,
  assertMemberLinkAvailable,
  ensureActiveAdminRemains,
} from "@/lib/admin-users";
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  memberId: z.number().int().positive().nullable().optional(),
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
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const email = parsed.data.email?.trim().toLowerCase();
  const existingUser = await prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
    },
  });

  if (!existingUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  try {
    await ensureActiveAdminRemains(userId, parsed.data.role, parsed.data.active);
    if (email) {
      await assertEmailAvailable(email, userId);
    }
    if (parsed.data.memberId !== undefined) {
      await assertMemberLinkAvailable(parsed.data.memberId, userId);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo actualizar el usuario",
      },
      { status: 400 }
    );
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : undefined;

  try {
    const user = await prisma.appUser.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        email,
        role: parsed.data.role,
        active: parsed.data.active,
        passwordHash,
        memberId: parsed.data.memberId,
      },
      select: appUserPublicSelect,
    });

    const actorUserId = Number(auth.session.user.id);
    const actorEmail = auth.session.user.email;

    if (parsed.data.password) {
      await createAuditLog({
        actorUserId,
        actorEmail,
        action: "INTERNAL_USER_PASSWORD_RESET",
        entityType: "AppUser",
        entityId: user.id,
        summary: `Password reset para usuario interno: ${user.email}`,
        metadata: {
          targetUserId: user.id,
        },
      });
    }

    if (user.role !== existingUser.role) {
      await createAuditLog({
        actorUserId,
        actorEmail,
        action: "INTERNAL_USER_ROLE_CHANGED",
        entityType: "AppUser",
        entityId: user.id,
        summary: `Rol cambiado para usuario interno: ${user.email}`,
        metadata: {
          previousRole: existingUser.role,
          nextRole: user.role,
        },
      });
    }

    if (user.active !== existingUser.active) {
      await createAuditLog({
        actorUserId,
        actorEmail,
        action: user.active
          ? "INTERNAL_USER_ACTIVATED"
          : "INTERNAL_USER_DEACTIVATED",
        entityType: "AppUser",
        entityId: user.id,
        summary: `${user.active ? "Usuario activado" : "Usuario desactivado"}: ${user.email}`,
        metadata: {
          active: user.active,
        },
      });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar. Revisa email o socio vinculado." },
      { status: 400 }
    );
  }
}
