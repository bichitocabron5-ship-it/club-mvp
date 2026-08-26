"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type AuditLogRecord = {
  id: number;
  actorUserId: number | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: unknown;
  createdAt: string;
  actorUser: {
    id: number;
    name: string;
    email: string;
  } | null;
};

type Filters = {
  entityType: string;
  action: string;
  actorEmail: string;
};

const initialFilters: Filters = {
  entityType: "",
  action: "",
  actorEmail: "",
};

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();

  if (filters.entityType.trim()) {
    params.set("entityType", filters.entityType.trim());
  }

  if (filters.action.trim()) {
    params.set("action", filters.action.trim());
  }

  if (filters.actorEmail.trim()) {
    params.set("actorEmail", filters.actorEmail.trim());
  }

  const query = params.toString();
  return query ? `/api/audit?${query}` : "/api/audit";
}

function formatActor(log: AuditLogRecord) {
  if (log.actorUser?.name) {
    return `${log.actorUser.name}${log.actorEmail ? ` (${log.actorEmail})` : ""}`;
  }

  if (log.actorEmail) {
    return log.actorEmail;
  }

  if (log.actorUserId) {
    return `Usuario #${log.actorUserId}`;
  }

  return "Sistema";
}

function formatMetadata(metadata: unknown) {
  if (!metadata) {
    return "";
  }

  return JSON.stringify(metadata, null, 2);
}

function getMetadataEntries(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  return Object.entries(metadata as Record<string, unknown>);
}

function formatMetadataValue(value: unknown) {
  if (value === null) return "null";
  if (value === undefined) return "-";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function AuditClient() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadLogs() {
      setLoading(true);

      try {
        const res = await fetch(buildQuery(filters), {
          signal: controller.signal,
        });

        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(data.error || "No se pudo cargar la auditoria");
        }

        const data: AuditLogRecord[] = await res.json();
        setLogs(data);
        setError("");
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo cargar la auditoria"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLogs();

    return () => controller.abort();
  }, [filters]);

  const hasActiveFilters =
    Boolean(filters.entityType.trim()) ||
    Boolean(filters.action.trim()) ||
    Boolean(filters.actorEmail.trim());

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Auditoría"
        description="Consulta los últimos eventos relevantes y revisa quién realizó cada operación."
      />

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Trazabilidad
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Filtrar eventos
              </h2>

              <p className="mt-1 text-sm app-muted">
                Acota la auditoría por entidad, acción realizada o usuario responsable.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-black text-[#645b4c]">
              Máximo 200 eventos
            </span>
          </div>
        </div>

        <form
          className="grid gap-4 p-5 sm:p-6 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draftFilters);
          }}
        >
          <label className="block text-sm font-bold text-[#201f1d]">
            Tipo de entidad

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Ej. MEMBER, SALE, USER..."
              value={draftFilters.entityType}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  entityType: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Acción

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Ej. CREATE, UPDATE, CANCEL..."
              value={draftFilters.action}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  action: event.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Usuario

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="email"
              placeholder="correo@club.com"
              value={draftFilters.actorEmail}
              onChange={(event) =>
                setDraftFilters({
                  ...draftFilters,
                  actorEmail: event.target.value,
                })
              }
            />
          </label>

          <div className="flex flex-col gap-2 border-t border-black/7 pt-4 sm:flex-row lg:col-span-3 lg:justify-end">
            <button
              type="button"
              disabled={!hasActiveFilters}
              className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              onClick={() => {
                setDraftFilters(initialFilters);
                setFilters(initialFilters);
              }}
            >
              Limpiar filtros
            </button>

            <button
              type="submit"
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold sm:w-auto"
            >
              Aplicar filtros
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            No se pudo cargar la auditoría
          </div>

          <div className="mt-1 text-sm font-semibold text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Registro de actividad
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Eventos de auditoría
              </h2>

              <p className="mt-1 text-sm app-muted">
                Revisa cronológicamente las operaciones registradas por el sistema.
              </p>
            </div>

            <div className="rounded-2xl border border-black/8 bg-[#f7f4ee] px-4 py-3">
              <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] app-muted">
                {hasActiveFilters ? "Resultados" : "Eventos"}
              </div>

              <div className="mt-1 text-lg font-black tabular-nums text-[#201f1d]">
                {logs.length}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-5 py-6 text-center text-sm font-semibold text-[#645b4c]">
              Cargando eventos de auditoría...
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-7 text-center">
              <div className="font-black text-[#201f1d]">
                No hay eventos para estos filtros
              </div>

              <p className="mt-2 text-sm app-muted">
                Prueba con otros criterios o limpia los filtros actuales.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <article
                  key={log.id}
                  className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-xs font-black text-[#645b4c]">
                              {log.action}
                            </span>

                            <span className="rounded-full border border-black/8 bg-white px-3 py-1 text-xs font-bold text-[#6d6860]">
                              {log.entityType}
                              {log.entityId ? ` #${log.entityId}` : ""}
                            </span>
                          </div>

                          <h3 className="mt-3 break-words text-base font-black leading-6 text-[#201f1d]">
                            {log.summary}
                          </h3>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-[#f7f4ee] px-3 py-2.5">
                              <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                                Actor
                              </div>

                              <div className="mt-1 break-words text-sm font-bold text-[#201f1d]">
                                {formatActor(log)}
                              </div>
                            </div>

                            <div className="rounded-xl bg-[#f7f4ee] px-3 py-2.5">
                              <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                                Fecha
                              </div>

                              <div className="mt-1 text-sm font-bold text-[#201f1d]">
                                {new Date(log.createdAt).toLocaleString("es-ES")}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-xs app-muted lg:text-right">
                        Evento #{log.id}
                      </div>
                    </div>

                    {log.metadata ? (
                      <div className="mt-4 border-t border-black/7 pt-4">
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 py-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-[#861f23]">
                                Detalle técnico
                              </span>

                              <span className="rounded-full border border-black/8 bg-[#f7f4ee] px-2 py-0.5 text-[0.65rem] font-bold app-muted">
                                {getMetadataEntries(log.metadata).length} campos
                              </span>
                            </div>

                            <span
                              aria-hidden="true"
                              className="text-sm font-black text-[#861f23] transition-transform group-open:rotate-90"
                            >
                              →
                            </span>
                          </summary>

                          <div className="mt-3 space-y-3">
                            {getMetadataEntries(log.metadata).length > 0 ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {getMetadataEntries(log.metadata).map(([key, value]) => (
                                  <div
                                    key={key}
                                    className="rounded-[1.1rem] border border-black/8 bg-[#f7f4ee]/80 px-3 py-3"
                                  >
                                    <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                                      {key}
                                    </div>

                                    <div className="mt-1 break-all text-sm font-bold text-[#201f1d]">
                                      {formatMetadataValue(value)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <details className="group/raw">
                              <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.1em] text-[#6d6860]">
                                Ver JSON completo
                              </summary>

                              <pre className="mt-2 max-w-full overflow-x-auto rounded-[1.25rem] border border-black/8 bg-[#0b0b0c] p-4 text-xs leading-6 text-white/85">
                                {formatMetadata(log.metadata)}
                              </pre>
                            </details>
                          </div>
                        </details>
                      </div>
                    ) : (
                      <div className="mt-4 border-t border-black/7 pt-4 text-xs app-muted">
                        Sin detalle técnico adicional.
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
