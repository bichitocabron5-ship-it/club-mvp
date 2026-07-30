import { EmptyState } from "@/components/ui/empty-state";
import {
  actionTone,
  formatDateTime,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardAuditLog } from "@/lib/types";

export function DashboardAuditSection({ logs }: { logs: DashboardAuditLog[] }) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Últimas acciones</h2>
      <p className="mt-1 text-sm app-muted">
        Últimos eventos de auditoría registrados en el sistema.
      </p>

      <div className="mt-4 space-y-3">
        {logs.length === 0 ? (
          <EmptyState
            message="Sin eventos recientes de auditoría."
            className="rounded-[1.5rem]"
          />
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{log.summary}</div>
                  <div className="mt-1 text-sm app-muted">
                    {log.actorUser?.name || log.actorEmail || "Sistema"} · {log.entityType}
                    {log.entityId ? ` #${log.entityId}` : ""}
                  </div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-bold ${actionTone(
                    log.action
                  )}`}
                >
                  {log.action}
                </div>
              </div>
              <div className="mt-2 text-xs app-muted">{formatDateTime(log.createdAt)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
