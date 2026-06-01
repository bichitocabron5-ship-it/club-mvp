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

type TaskPriority = (typeof PRIORITY_VALUES)[number];
type TaskStatus = (typeof STATUS_VALUES)[number];

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

type OperationalTaskWithUsers = Prisma.OperationalTaskGetPayload<{
  include: typeof taskInclude;
}>;

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

const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.enum(CATEGORY_VALUES).optional().default("GENERAL"),
    priority: z.enum(PRIORITY_VALUES).optional().default("NORMAL"),
    dueAt: optionalDueAtSchema.optional(),
  })
  .strict();

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

function normalizeOptionalText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function getActorUserId(userId: string | undefined) {
  const actorUserId = Number(userId);
  return Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
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

function readFilter<T extends string>(
  params: URLSearchParams,
  key: string,
  allowedValues: readonly T[]
) {
  const values = params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (values.length === 0) {
    return { ok: true as const, values: null };
  }

  const allowedSet = new Set<string>(allowedValues);
  const invalidValue = values.find((value) => !allowedSet.has(value));

  if (invalidValue) {
    return {
      ok: false as const,
      error: `Filtro ${key} inválido`,
    };
  }

  return {
    ok: true as const,
    values: Array.from(new Set(values)) as T[],
  };
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = readFilter(searchParams, "status", STATUS_VALUES);
  const categoryFilter = readFilter(searchParams, "category", CATEGORY_VALUES);
  const priorityFilter = readFilter(searchParams, "priority", PRIORITY_VALUES);

  for (const filter of [statusFilter, categoryFilter, priorityFilter]) {
    if (!filter.ok) {
      return NextResponse.json({ error: filter.error }, { status: 400 });
    }
  }

  const baseWhere: Prisma.OperationalTaskWhereInput = {};

  if (categoryFilter.values) {
    baseWhere.category = {
      in: categoryFilter.values,
    };
  }

  if (priorityFilter.values) {
    baseWhere.priority = {
      in: priorityFilter.values,
    };
  }

  if (!statusFilter.values) {
    const [openTasks, doneTasks] = await Promise.all([
      prisma.operationalTask.findMany({
        where: {
          ...baseWhere,
          status: "OPEN",
        },
        include: taskInclude,
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
        include: taskInclude,
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

    return NextResponse.json([...openTasks, ...doneTasks].sort(compareTasks));
  }

  const where: Prisma.OperationalTaskWhereInput = {
    ...baseWhere,
    status: {
      in: statusFilter.values,
    },
  };

  const tasks = await prisma.operationalTask.findMany({
    where,
    include: taskInclude,
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  return NextResponse.json(tasks.sort(compareTasks));
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

  const actorUserId = getActorUserId(auth.session.user.id);
  const task = await prisma.operationalTask.create({
    data: {
      title: parsed.data.title,
      description: normalizeOptionalText(parsed.data.description),
      category: parsed.data.category,
      priority: parsed.data.priority,
      dueAt: parsed.data.dueAt ?? null,
      createdByUserId: actorUserId,
    },
    include: taskInclude,
  });

  await createAuditLog({
    actorUserId,
    actorEmail: auth.session.user.email,
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

  return NextResponse.json(task, { status: 201 });
}
