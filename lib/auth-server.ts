// lib/auth-server.ts
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AuthSuccess = {
  ok: true;
  session: Session;
};

type AuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

type AuthResult = AuthSuccess | AuthFailure;

const STAFF_ROLES = new Set(["ADMIN", "STAFF"]);

export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authConfig);

  if (!session?.user) {
    return {
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    };
  }

  // The verified session supplies identity; persisted state supplies authority.
  const sessionUserId = session.user.id;
  const userId = Number(sessionUserId);
  if (
    typeof sessionUserId !== "string" ||
    !/^[1-9]\d*$/.test(sessionUserId) ||
    !Number.isSafeInteger(userId) ||
    userId > 2_147_483_647
  ) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  // Do not cache across requests: deactivation and role changes apply next call.
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { id: true, active: true, role: true, name: true, email: true },
  });

  if (!user || user.active !== true) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  return {
    ok: true,
    session: {
      ...session,
      user: {
        ...session.user,
        id: String(user.id),
        role: user.role,
        name: user.name,
        email: user.email,
      },
    },
  };
}

export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireAuth();

  if (!auth.ok) {
    return auth;
  }

  if (auth.session.user.role !== "ADMIN") {
    return {
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    };
  }

  return auth;
}

export async function requireStaffOrAdmin(): Promise<AuthResult> {
  const auth = await requireAuth();

  if (!auth.ok) {
    return auth;
  }

  if (!STAFF_ROLES.has(auth.session.user.role)) {
    return {
      ok: false,
      status: 403,
      error: "FORBIDDEN",
    };
  }

  return auth;
}
