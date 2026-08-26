"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";

type TaskCategory =
  | "GENERAL"
  | "PRODUCT"
  | "STOCK"
  | "MEMBER"
  | "CASH"
  | "CLEANING"
  | "INCIDENT"
  | "NEXT_SHIFT";

type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type TaskStatus = "OPEN" | "DONE" | "CANCELLED";

type TaskUser = {
  id: number;
  name: string;
  email: string | null;
};

type OperationalTask = {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  createdByUserId: number | null;
  completedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdByUser: TaskUser | null;
  completedByUser: TaskUser | null;
};

type TaskForm = {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueAt: string;
};

type EditTaskForm = TaskForm & {
  status: TaskStatus;
};

type TaskPatchPayload = Partial<Omit<EditTaskForm, "dueAt">> & {
  dueAt?: string | null;
};

const CATEGORY_OPTIONS: Array<{ value: TaskCategory; label: string }> = [
  { value: "GENERAL", label: "General" },
  { value: "PRODUCT", label: "Producto" },
  { value: "STOCK", label: "Stock" },
  { value: "MEMBER", label: "Socio" },
  { value: "CASH", label: "Caja" },
  { value: "CLEANING", label: "Limpieza" },
  { value: "INCIDENT", label: "Incidencia" },
  { value: "NEXT_SHIFT", label: "Siguiente turno" },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "LOW", label: "Baja" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "OPEN", label: "Abierta" },
  { value: "DONE", label: "Hecha" },
  { value: "CANCELLED", label: "Cancelada" },
];

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label])
) as Record<TaskCategory, string>;

const PRIORITY_LABELS = Object.fromEntries(
  PRIORITY_OPTIONS.map((option) => [option.value, option.label])
) as Record<TaskPriority, string>;

const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label])
) as Record<TaskStatus, string>;

const emptyForm: TaskForm = {
  title: "",
  description: "",
  category: "GENERAL",
  priority: "NORMAL",
  dueAt: "",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toApiDueAt(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function isTaskOverdue(task: OperationalTask) {
  return (
    task.status === "OPEN" &&
    task.dueAt !== null &&
    new Date(task.dueAt).getTime() < Date.now()
  );
}

function priorityBadgeClass(priority: TaskPriority) {
  if (priority === "URGENT") {
    return "app-badge-danger";
  }

  if (priority === "HIGH") {
    return "app-badge-warning";
  }

  if (priority === "LOW") {
    return "app-badge-info";
  }

  return "app-badge-info";
}

function statusBadgeClass(status: TaskStatus) {
  if (status === "DONE") {
    return "app-badge-positive";
  }

  if (status === "CANCELLED") {
    return "app-badge-info";
  }

  return "app-badge-info";
}

function buildEditForm(task: OperationalTask): EditTaskForm {
  return {
    title: task.title,
    description: task.description ?? "",
    category: task.category,
    priority: task.priority,
    status: task.status,
    dueAt: toDateTimeLocal(task.dueAt),
  };
}

export function TasksClient() {
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [editForm, setEditForm] = useState<EditTaskForm>({
    ...emptyForm,
    status: "OPEN",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadTasks() {
    setLoading(true);

    try {
      const data = await fetchJson<OperationalTask[]>("/api/tasks");
      setTasks(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando tareas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadTasks();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const urgentTasks = useMemo(
    () => tasks.filter((task) => task.status === "OPEN" && task.priority === "URGENT"),
    [tasks]
  );

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "OPEN" && task.priority !== "URGENT"),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "DONE").slice(0, 12),
    [tasks]
  );

  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault();
    setSavingKey("create");
    setError("");

    try {
      await fetchJson<OperationalTask>("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          dueAt: toApiDueAt(form.dueAt),
        }),
      });

      setForm(emptyForm);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando tarea");
    } finally {
      setSavingKey(null);
    }
  }

  function startEdit(task: OperationalTask) {
    setEditingId(task.id);
    setEditForm(buildEditForm(task));
    setError("");
  }

  async function patchTask(
    taskId: number,
    payload: TaskPatchPayload,
    key: string
  ) {
    setSavingKey(key);
    setError("");

    try {
      await fetchJson<OperationalTask>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await loadTasks();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando tarea");
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function handleEditSubmit(event: React.FormEvent, taskId: number) {
    event.preventDefault();

    const updated = await patchTask(
      taskId,
      {
        ...editForm,
        dueAt: toApiDueAt(editForm.dueAt),
      },
      `edit-${taskId}`
    );

    if (updated) {
      setEditingId(null);
    }
  }

  async function markTaskDone(task: OperationalTask) {
    await patchTask(task.id, { status: "DONE" }, `done-${task.id}`);
  }

  async function cancelTask(task: OperationalTask) {
    if (!window.confirm("¿Cancelar esta tarea?")) {
      return;
    }

    const updated = await patchTask(
      task.id,
      { status: "CANCELLED" },
      `cancel-${task.id}`
    );

    if (updated && editingId === task.id) {
      setEditingId(null);
    }
  }

  function renderCategoryOptions() {
    return CATEGORY_OPTIONS.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ));
  }

  function renderPriorityOptions() {
    return PRIORITY_OPTIONS.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ));
  }

  function renderTask(task: OperationalTask) {
    const overdue = isTaskOverdue(task);
    const urgent = task.priority === "URGENT";
    const isEditing = editingId === task.id;
    const createdBy = task.createdByUser?.name || task.createdByUser?.email;

    return (
      <article
        key={task.id}
        className={[
          "rounded-[1.5rem] border p-4",
          urgent
            ? "border-red-300 bg-red-50/90 shadow-sm"
            : overdue
              ? "border-amber-300 bg-amber-50/90"
              : "border-black/8 bg-white/85",
        ].join(" ")}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black">{task.title}</h3>
              {urgent ? (
                <span className="app-badge app-badge-danger rounded-full px-3 py-1 text-xs">
                  Urgente
                </span>
              ) : null}
              {overdue ? (
                <span className="app-badge app-badge-warning rounded-full px-3 py-1 text-xs">
                  Vencida
                </span>
              ) : null}
            </div>

            {task.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#201f1d]">
                {task.description}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="app-badge app-badge-info rounded-full px-3 py-1">
                {CATEGORY_LABELS[task.category]}
              </span>
              <span
                className={`app-badge rounded-full px-3 py-1 ${priorityBadgeClass(
                  task.priority
                )}`}
              >
                {PRIORITY_LABELS[task.priority]}
              </span>
              <span
                className={`app-badge rounded-full px-3 py-1 ${statusBadgeClass(
                  task.status
                )}`}
              >
                {STATUS_LABELS[task.status]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs app-muted">
              {task.dueAt ? <span>Límite: {formatDateTime(task.dueAt)}</span> : null}
              {createdBy ? <span>Creada por: {createdBy}</span> : null}
              <span>Creada: {formatDateTime(task.createdAt)}</span>
              {task.completedAt ? (
                <span>Hecha: {formatDateTime(task.completedAt)}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {task.status === "OPEN" ? (
              <button
                type="button"
                onClick={() => void markTaskDone(task)}
                disabled={savingKey !== null}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingKey === `done-${task.id}` ? "Guardando..." : "Marcar como hecha"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => startEdit(task)}
              disabled={savingKey !== null}
              className="app-button-secondary rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              Editar
            </button>
            {task.status !== "CANCELLED" ? (
              <button
                type="button"
                onClick={() => void cancelTask(task)}
                disabled={savingKey !== null}
                className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
              >
                {savingKey === `cancel-${task.id}` ? "Cancelando..." : "Cancelar"}
              </button>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <form
            onSubmit={(event) => void handleEditSubmit(event, task.id)}
            className="mt-4 grid gap-3 rounded-[1.25rem] border border-black/8 bg-white/75 p-3 md:grid-cols-2"
          >
            <input
              className="rounded-2xl border border-black/10 bg-white/90 p-3"
              aria-label="Título de la tarea"
              value={editForm.title}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              disabled={savingKey !== null}
              required
            />
            <select
              className="rounded-2xl border border-black/10 bg-white/90 p-3"
              aria-label="Estado de la tarea"
              value={editForm.status}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  status: event.target.value as TaskStatus,
                }))
              }
              disabled={savingKey !== null}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-black/10 bg-white/90 p-3"
              aria-label="Categoría de la tarea"
              value={editForm.category}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  category: event.target.value as TaskCategory,
                }))
              }
              disabled={savingKey !== null}
            >
              {renderCategoryOptions()}
            </select>
            <select
              className="rounded-2xl border border-black/10 bg-white/90 p-3"
              aria-label="Prioridad de la tarea"
              value={editForm.priority}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  priority: event.target.value as TaskPriority,
                }))
              }
              disabled={savingKey !== null}
            >
              {renderPriorityOptions()}
            </select>
            <textarea
              className="min-h-28 rounded-2xl border border-black/10 bg-white/90 p-3 md:col-span-2"
              aria-label="Descripción de la tarea"
              value={editForm.description}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              disabled={savingKey !== null}
            />
            <input
              type="datetime-local"
              className="rounded-2xl border border-black/10 bg-white/90 p-3"
              aria-label="Fecha/hora límite de la tarea"
              value={editForm.dueAt}
              onChange={(event) =>
                setEditForm((current) => ({
                  ...current,
                  dueAt: event.target.value,
                }))
              }
              disabled={savingKey !== null}
            />
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                className="app-button-primary rounded-full px-5 py-2 text-sm font-bold disabled:opacity-50"
                disabled={savingKey !== null}
              >
                {savingKey === `edit-${task.id}` ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                className="app-button-secondary rounded-full px-5 py-2 text-sm font-bold disabled:opacity-50"
                onClick={() => setEditingId(null)}
                disabled={savingKey !== null}
              >
                Cerrar
              </button>
            </div>
          </form>
        ) : null}
      </article>
    );
  }

  function renderTaskSection(
    title: string,
    sectionTasks: OperationalTask[],
    emptyMessage: string
  ) {
    return (
      <section className="app-panel rounded-[2rem] p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">{title}</h2>
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold app-muted">
            {sectionTasks.length}
          </span>
        </div>

        <div className="space-y-3">
          {sectionTasks.length > 0 ? (
            sectionTasks.map((task) => renderTask(task))
          ) : (
            <EmptyState message={emptyMessage} className="rounded-[1.5rem]" />
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Tareas de turno"
        description="Pendientes, incidencias y notas para el siguiente turno."
      />

      {error ? (
        <div className="mb-4 rounded-[1.25rem] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <section className="app-panel-strong mb-6 rounded-[2rem] p-4 md:p-5">
        <form onSubmit={handleCreateTask} className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-1 text-sm font-bold">
            <span>Título</span>
            <input
              className="w-full rounded-2xl border border-black/10 bg-white/90 p-3 font-normal"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              disabled={savingKey !== null}
              required
            />
          </label>

          <label className="space-y-1 text-sm font-bold">
            <span>Fecha/hora límite opcional</span>
            <input
              type="datetime-local"
              className="w-full rounded-2xl border border-black/10 bg-white/90 p-3 font-normal"
              value={form.dueAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dueAt: event.target.value,
                }))
              }
              disabled={savingKey !== null}
            />
          </label>

          <label className="space-y-1 text-sm font-bold">
            <span>Categoría</span>
            <select
              className="w-full rounded-2xl border border-black/10 bg-white/90 p-3 font-normal"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as TaskCategory,
                }))
              }
              disabled={savingKey !== null}
            >
              {renderCategoryOptions()}
            </select>
          </label>

          <label className="space-y-1 text-sm font-bold">
            <span>Prioridad</span>
            <select
              className="w-full rounded-2xl border border-black/10 bg-white/90 p-3 font-normal"
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as TaskPriority,
                }))
              }
              disabled={savingKey !== null}
            >
              {renderPriorityOptions()}
            </select>
          </label>

          <label className="space-y-1 text-sm font-bold lg:col-span-2">
            <span>Descripción</span>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-black/10 bg-white/90 p-3 font-normal"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              disabled={savingKey !== null}
            />
          </label>

          <div className="lg:col-span-2">
            <button
              className="app-button-primary w-full rounded-2xl p-3 font-black disabled:opacity-50 md:w-auto md:px-6"
              disabled={savingKey !== null}
            >
              {savingKey === "create" ? "Añadiendo..." : "Añadir tarea"}
            </button>
          </div>
        </form>
      </section>

      <div className="space-y-5">
        {loading ? (
          <EmptyState message="Cargando tareas..." className="rounded-[1.5rem]" />
        ) : null}
        {renderTaskSection("Urgente", urgentTasks, "No hay tareas urgentes abiertas.")}
        {renderTaskSection("Abiertas", openTasks, "No hay tareas abiertas.")}
        {renderTaskSection(
          "Completadas recientes",
          completedTasks,
          "No hay tareas completadas recientemente."
        )}
      </div>
    </main>
  );
}
