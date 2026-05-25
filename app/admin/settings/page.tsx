import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-server";

import { AdminSettingsClient } from "./settings-client";

export default async function AdminSettingsPage() {
  const auth = await requireAdmin();

  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }

    redirect("/");
  }

  return <AdminSettingsClient />;
}
