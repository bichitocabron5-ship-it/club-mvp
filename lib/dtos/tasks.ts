import type { Prisma } from "@prisma/client";

export const TASK_CATEGORY_VALUES = [
  "GENERAL",
  "PRODUCT",
  "STOCK",
  "MEMBER",
  "CASH",
  "CLEANING",
  "INCIDENT",
  "NEXT_SHIFT",
] as const;

export const TASK_PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const TASK_STATUS_VALUES = ["OPEN", "DONE", "CANCELLED"] as const;

export type TaskCategory = (typeof TASK_CATEGORY_VALUES)[number];
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export type OperationalTaskWithUsers = Prisma.OperationalTaskGetPayload<{
  include: {
    createdByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    completedByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

export type TaskActorDto = {
  userId: string | undefined;
  email: string | null | undefined;
};

export type CreateTaskDto = {
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  dueAt?: Date | null;
};

export type UpdateTaskDto = {
  title?: string;
  description?: string | null;
  category?: TaskCategory;
  priority?: TaskPriority;
  dueAt?: Date | null;
  status?: TaskStatus;
};

export type TaskListFiltersDto = {
  status: TaskStatus[] | null;
  category: TaskCategory[] | null;
  priority: TaskPriority[] | null;
};
