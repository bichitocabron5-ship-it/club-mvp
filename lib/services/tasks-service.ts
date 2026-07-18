import type { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import {
  type CreateTaskDto,
  type OperationalTaskWithUsers,
  type TaskActorDto,
  type TaskListFiltersDto,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskDto,
} from "@/lib/dtos/tasks";
import {
  getTaskActorUserId,
  normalizeTaskOptionalText,
} from "@/lib/helpers/task-helpers";
import { prisma } from "@/lib/prisma";
import {
  serializeOperationalTask,
  serializeOperationalTasks,
  type SerializedOperationalTask,
} from "@/lib/serializers/task-serializers";

const operationalTaskInclude = {
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
} satisfies Prisma.OperationalTaskInclude;

const priorityRank: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const statusRank: Record<TaskStatus, number> = {
  OPEN: 0,
  DONE: 1,
  CANCELLED: 2,
};

export class TaskServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function getTime(value: Date | string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

function isOverdue(task: OperationalTaskWithUsers, now: number) {
  return task.status === "OPEN" && task.dueAt !== null && getTime(task.dueAt) < now;
}

function compareTasks(a: OperationalTaskWithUsers, b: OperationalTaskWithUsers) {
  const statusDifference =
    statusRank[a.status as TaskStatus] - statusRank[b.status as TaskStatus];

  if (statusDifference !== 0) {
    return statusDifference;
  }

  const priorityDifference =
    priorityRank[a.priority as TaskPriority] - priorityRank[b.priority as TaskPriority];

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const now = Date.now();
  const overdueDifference = Number(isOverdue(b, now)) - Number(isOverdue(a, now));

  if (overdueDifference !== 0) {
    return overdueDifference;
  }

  const aDate = a.status === "DONE" ? (a.completedAt ?? a.updatedAt) : a.createdAt;
  const bDate = b.status === "DONE" ? (b.completedAt ?? b.updatedAt) : b.createdAt;

  return getTime(bDate) - getTime(aDate);
}

export async function listOperationalTasks(
  filters: TaskListFiltersDto
): Promise<SerializedOperationalTask[]> {
  const baseWhere: Prisma.OperationalTaskWhereInput = {};

  if (filters.category) {
    baseWhere.category = {
      in: filters.category,
    };
  }

  if (filters.priority) {
    baseWhere.priority = {
      in: filters.priority,
    };
  }

  if (!filters.status) {
    const [openTasks, doneTasks] = await Promise.all([
      prisma.operationalTask.findMany({
        where: {
          ...baseWhere,
          status: "OPEN",
        },
        include: operationalTaskInclude,
        orderBy: {
          createdAt: "desc",
        },
        take: 200,
      }),
      prisma.operationalTask.findMany({
        where: {
          ...baseWhere,
          status: "DONE",
        },
        include: operationalTaskInclude,
        orderBy: [
          {
            completedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 50,
      }),
    ]);

    return serializeOperationalTasks([...openTasks, ...doneTasks].sort(compareTasks));
  }

  const where: Prisma.OperationalTaskWhereInput = {
    ...baseWhere,
    status: {
      in: filters.status,
    },
  };

  const tasks = await prisma.operationalTask.findMany({
    where,
    include: operationalTaskInclude,
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  return serializeOperationalTasks(tasks.sort(compareTasks));
}

export async function createOperationalTask(
  input: CreateTaskDto,
  actor: TaskActorDto
): Promise<SerializedOperationalTask> {
  const actorUserId = getTaskActorUserId(actor.userId);
  const task = await prisma.operationalTask.create({
    data: {
      title: input.title,
      description: normalizeTaskOptionalText(input.description),
      category: input.category,
      priority: input.priority,
      dueAt: input.dueAt ?? null,
      createdByUserId: actorUserId,
    },
    include: operationalTaskInclude,
  });

  await createAuditLog({
    actorUserId,
    actorEmail: actor.email,
    action: "TASK_CREATED",
    entityType: "OperationalTask",
    entityId: task.id,
    summary: `Tarea creada: ${task.title}`,
    metadata: {
      category: task.category,
      priority: task.priority,
      dueAt: task.dueAt?.toISOString() ?? null,
    },
  });

  return serializeOperationalTask(task);
}

export async function updateOperationalTask(
  id: number,
  input: UpdateTaskDto,
  actor: TaskActorDto
): Promise<SerializedOperationalTask> {
  const actorUserId = getTaskActorUserId(actor.userId);
  const updatedTask = await prisma.$transaction(async (tx) => {
    const currentTask = await tx.operationalTask.findUnique({
      where: {
        id,
      },
    });

    if (!currentTask) {
      throw new TaskServiceError("Tarea no encontrada", 404);
    }

    const data: Prisma.OperationalTaskUncheckedUpdateInput = {};

    if (input.title !== undefined) {
      data.title = input.title;
    }

    if (input.description !== undefined) {
      data.description = normalizeTaskOptionalText(input.description);
    }

    if (input.category !== undefined) {
      data.category = input.category;
    }

    if (input.priority !== undefined) {
      data.priority = input.priority;
    }

    if (input.dueAt !== undefined) {
      data.dueAt = input.dueAt;
    }

    let action = "TASK_UPDATED";
    const nextStatus = input.status ?? currentTask.status;

    if (input.status !== undefined) {
      data.status = input.status;
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
      include: operationalTaskInclude,
    });

    await createAuditLog({
      db: tx,
      actorUserId,
      actorEmail: actor.email,
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
        changedFields: Object.keys(input),
      },
    });

    return updated;
  });

  return serializeOperationalTask(updatedTask);
}
