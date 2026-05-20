// lib/auth-server.ts
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

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

  return {
    ok: true,
    session,
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
