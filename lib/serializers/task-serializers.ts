import type { OperationalTaskWithUsers } from "@/lib/dtos/tasks";

type SerializedTaskUser = {
  id: number;
  name: string;
  email: string;
};

export type SerializedOperationalTask = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  dueAt: string | null;
  createdByUserId: number | null;
  completedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdByUser: SerializedTaskUser | null;
  completedByUser: SerializedTaskUser | null;
};

function serializeTaskUser(
  user: OperationalTaskWithUsers["createdByUser"]
): SerializedTaskUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function serializeOperationalTask(
  task: OperationalTaskWithUsers
): SerializedOperationalTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdByUserId: task.createdByUserId,
    completedByUserId: task.completedByUserId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    cancelledAt: task.cancelledAt?.toISOString() ?? null,
    createdByUser: serializeTaskUser(task.createdByUser),
    completedByUser: serializeTaskUser(task.completedByUser),
  };
}

export function serializeOperationalTasks(tasks: OperationalTaskWithUsers[]) {
  return tasks.map(serializeOperationalTask);
}
