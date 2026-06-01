import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-server";
import { TasksClient } from "./tasks-client";

export default async function TasksPage() {
  const auth = await requireAuth();

  if (!auth.ok) {
    redirect("/login?callbackUrl=/tasks");
  }

  return <TasksClient />;
}
