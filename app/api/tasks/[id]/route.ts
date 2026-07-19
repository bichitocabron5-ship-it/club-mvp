import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-server";
import {
  TaskServiceError,
  updateOperationalTask,
} from "@/lib/services/tasks-service";
import { taskIdSchema, updateTaskSchema } from "@/lib/validations/tasks";

export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id: rawId } = await ctx.params;
    const parsedId = taskIdSchema.safeParse(rawId);

    if (!parsedId.success) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = updateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const updatedTask = await updateOperationalTask(parsedId.data, parsed.data, {
      userId: auth.session.user.id,
      email: auth.session.user.email,
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    if (error instanceof TaskServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/tasks/[id]] Failed to update task", error);

    return NextResponse.json(
      { error: "Error actualizando tarea" },
      { status: 500 }
    );
  }
}
