import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-server";
import {
  createOperationalTask,
  listOperationalTasks,
} from "@/lib/services/tasks-service";
import { createTaskSchema, parseTaskFilters } from "@/lib/validations/tasks";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const parsedFilters = parseTaskFilters(searchParams);

  if (!parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }

  const tasks = await listOperationalTasks(parsedFilters.filters);
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const task = await createOperationalTask(parsed.data, {
    userId: auth.session.user.id,
    email: auth.session.user.email,
  });

  return NextResponse.json(task, { status: 201 });
}
