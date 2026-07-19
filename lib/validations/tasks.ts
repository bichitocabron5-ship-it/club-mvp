import { z } from "zod";

import {
  TASK_CATEGORY_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  type TaskListFiltersDto,
} from "@/lib/dtos/tasks";

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

export const taskIdSchema = z.coerce.number().int().positive();

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.enum(TASK_CATEGORY_VALUES).optional().default("GENERAL"),
    priority: z.enum(TASK_PRIORITY_VALUES).optional().default("NORMAL"),
    dueAt: optionalDueAtSchema.optional(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.enum(TASK_CATEGORY_VALUES).optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    dueAt: optionalDueAtSchema.optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Sin cambios",
  });

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

export function parseTaskFilters(params: URLSearchParams) {
  const status = readFilter(params, "status", TASK_STATUS_VALUES);
  const category = readFilter(params, "category", TASK_CATEGORY_VALUES);
  const priority = readFilter(params, "priority", TASK_PRIORITY_VALUES);

  if (!status.ok) {
    return {
      ok: false as const,
      error: status.error,
    };
  }

  if (!category.ok) {
    return {
      ok: false as const,
      error: category.error,
    };
  }

  if (!priority.ok) {
    return {
      ok: false as const,
      error: priority.error,
    };
  }

  return {
    ok: true as const,
    filters: {
      status: status.values,
      category: category.values,
      priority: priority.values,
    } satisfies TaskListFiltersDto,
  };
}
