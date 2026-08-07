import { EmptyState } from "@/components/ui/empty-state";
import {
  actionTone,
  formatDateTime,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardAuditLog } from "@/lib/types";

export function DashboardAuditSection({ logs }: { logs: DashboardAuditLog[] }) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Ultimas acciones</h2>
      <p className="mt-1 text-sm app-muted">
        Eventos recientes de auditoria registrados en el sistema.
      </p>

      <div className="mt-4 space-y-3">
        {logs.length === 0 ? (
          <EmptyState
            title="Sin eventos recientes"
            message="No hay actividad de auditoria registrada en esta lectura."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="break-words font-semibold">{log.summary}</div>
                  <div className="mt-1 break-words text-sm app-muted">
                    {log.actorUser?.name || log.actorEmail || "Sistema"} -{" "}
                    {log.entityType}
                    {log.entityId ? ` #${log.entityId}` : ""}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${actionTone(
                    log.action
                  )}`}
                >
                  {log.action}
                </div>
              </div>
              <div className="mt-2 text-xs app-muted">
                {formatDateTime(log.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
