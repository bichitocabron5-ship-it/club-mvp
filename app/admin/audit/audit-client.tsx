"use client";

import { useEffect, useState } from "react";

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

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Auditoría</h1>
        <p className="text-sm text-gray-500">
          Últimos 200 eventos operativos relevantes.
        </p>
      </div>

      <form
        className="mb-6 grid gap-3 rounded border p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters(draftFilters);
        }}
      >
        <input
          className="rounded border p-3"
          placeholder="EntityType"
          value={draftFilters.entityType}
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, entityType: event.target.value })
          }
        />
        <input
          className="rounded border p-3"
          placeholder="Action"
          value={draftFilters.action}
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, action: event.target.value })
          }
        />
        <input
          className="rounded border p-3"
          placeholder="Actor email"
          value={draftFilters.actorEmail}
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, actorEmail: event.target.value })
          }
        />
        <div className="flex gap-2">
          <button className="rounded bg-blue-600 px-4 py-3 font-bold text-white">
            Filtrar
          </button>
          <button
            type="button"
            className="rounded border px-4 py-3 font-semibold"
            onClick={() => {
              setDraftFilters(initialFilters);
              setFilters(initialFilters);
            }}
          >
            Limpiar
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded border">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Resumen</th>
                <th className="px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No hay eventos para los filtros actuales.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b align-top">
                    <td className="px-3 py-3 text-gray-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">{formatActor(log)}</td>
                    <td className="px-3 py-3 font-semibold">{log.action}</td>
                    <td className="px-3 py-3">
                      <div>{log.entityType}</div>
                      {log.entityId && (
                        <div className="text-xs text-gray-500">ID: {log.entityId}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">{log.summary}</td>
                    <td className="px-3 py-3">
                      {log.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-blue-700">
                            Ver metadata
                          </summary>
                          <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
                            {formatMetadata(log.metadata)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">Sin metadata</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
