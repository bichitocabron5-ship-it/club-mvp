import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-server";

import { AuditClient } from "./audit-client";

export default async function AuditPage() {
  const auth = await requireAdmin();

  if (!auth.ok) {
    if (auth.status === 401) {
      redirect("/login");
    }

    redirect("/");
  }

  return <AuditClient />;
}
