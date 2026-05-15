// lib/auth-server.ts
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

export async function requireAuth() {
  const session = await getServerSession(authConfig);

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();

  if (session.user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return session;
}