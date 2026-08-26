import { EmptyState } from "@/components/ui/empty-state";
import {
  actionTone,
  formatDateTime,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardAuditLog } from "@/lib/types";

export function DashboardAuditSection({ logs }: { logs: DashboardAuditLog[] }) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                Trazabilidad
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Últimas acciones
            </h2>

            <p className="mt-1 text-sm app-muted">
              Actividad reciente registrada en el sistema.
            </p>
          </div>

          <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
            {logs.length} eventos
          </span>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {logs.length === 0 ? (
          <EmptyState
            title="Sin eventos recientes"
            message="No hay actividad de auditoría registrada en esta lectura."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          logs.map((log, index) => (
            <div
              key={log.id}
              className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0">
                    <div className="break-words font-black text-[#201f1d]">
                      {log.summary}
                    </div>

                    <div className="mt-1 break-words text-sm app-muted">
                      {log.actorUser?.name || log.actorEmail || "Sistema"} ·{" "}
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId}` : ""}
                    </div>
                  </div>
                </div>

                <div
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${actionTone(
                    log.action,
                  )}`}
                >
                  {log.action}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-black/6 pt-3 text-xs app-muted">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[#a7282d]/60"
                />

                {formatDateTime(log.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
