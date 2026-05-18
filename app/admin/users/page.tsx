import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-server";

import { AdminUsersClient } from "./users-client";

export default async function AdminUsersPage() {
  const auth = await requireAdmin();

  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }

    redirect("/");
  }

  return <AdminUsersClient />;
}
