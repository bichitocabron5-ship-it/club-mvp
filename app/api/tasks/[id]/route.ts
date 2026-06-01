import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const CATEGORY_VALUES = [
  "GENERAL",
  "PRODUCT",
  "STOCK",
  "MEMBER",
  "CASH",
  "CLEANING",
  "INCIDENT",
  "NEXT_SHIFT",
] as const;

const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const STATUS_VALUES = ["OPEN", "DONE", "CANCELLED"] as const;

const taskInclude = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  completedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

const taskIdSchema = z.coerce.number().int().positive();

const optionalDueAtSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" || value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }

  return value;
}, z.date().nullable());

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.enum(CATEGORY_VALUES).optional(),
    priority: z.enum(PRIORITY_VALUES).optional(),
    dueAt: optionalDueAtSchema.optional(),
    status: z.enum(STATUS_VALUES).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Sin cambios",
  });

class TaskApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function getActorUserId(userId: string | undefined) {
  const actorUserId = Number(userId);
  return Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
}

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

    const actorUserId = getActorUserId(auth.session.user.id);
    const updatedTask = await prisma.$transaction(async (tx) => {
      const currentTask = await tx.operationalTask.findUnique({
        where: {
          id: parsedId.data,
        },
      });

      if (!currentTask) {
        throw new TaskApiError("Tarea no encontrada", 404);
      }

      const data: Prisma.OperationalTaskUncheckedUpdateInput = {};

      if (parsed.data.title !== undefined) {
        data.title = parsed.data.title;
      }

      if (parsed.data.description !== undefined) {
        data.description = normalizeOptionalText(parsed.data.description);
      }

      if (parsed.data.category !== undefined) {
        data.category = parsed.data.category;
      }

      if (parsed.data.priority !== undefined) {
        data.priority = parsed.data.priority;
      }

      if (parsed.data.dueAt !== undefined) {
        data.dueAt = parsed.data.dueAt;
      }

      let action = "TASK_UPDATED";
      const nextStatus = parsed.data.status ?? currentTask.status;

      if (parsed.data.status !== undefined) {
        data.status = parsed.data.status;
      }

      if (nextStatus !== currentTask.status && nextStatus === "DONE") {
        const completedAt = new Date();
        data.completedAt = completedAt;
        data.completedByUserId = actorUserId;
        data.cancelledAt = null;
        action = "TASK_COMPLETED";
      } else if (nextStatus !== currentTask.status && nextStatus === "CANCELLED") {
        data.cancelledAt = new Date();
        data.completedAt = null;
        data.completedByUserId = null;
        action = "TASK_CANCELLED";
      } else if (nextStatus !== currentTask.status && nextStatus === "OPEN") {
        data.completedAt = null;
        data.completedByUserId = null;
        data.cancelledAt = null;
      }

      const updated = await tx.operationalTask.update({
        where: {
          id: currentTask.id,
        },
        data,
        include: taskInclude,
      });

      await createAuditLog({
        db: tx,
        actorUserId,
        actorEmail: auth.session.user.email,
        action,
        entityType: "OperationalTask",
        entityId: updated.id,
        summary:
          action === "TASK_COMPLETED"
            ? `Tarea marcada como hecha: ${updated.title}`
            : action === "TASK_CANCELLED"
              ? `Tarea cancelada: ${updated.title}`
              : `Tarea actualizada: ${updated.title}`,
        metadata: {
          previous: {
            title: currentTask.title,
            category: currentTask.category,
            priority: currentTask.priority,
            status: currentTask.status,
            dueAt: currentTask.dueAt?.toISOString() ?? null,
          },
          next: {
            title: updated.title,
            category: updated.category,
            priority: updated.priority,
            status: updated.status,
            dueAt: updated.dueAt?.toISOString() ?? null,
          },
          changedFields: Object.keys(parsed.data),
        },
      });

      return updated;
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    if (error instanceof TaskApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/tasks/[id]] Failed to update task", error);

    return NextResponse.json(
      { error: "Error actualizando tarea" },
      { status: 500 }
    );
  }
}
