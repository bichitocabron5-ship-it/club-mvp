import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { alertClassName } from "@/lib/helpers/dashboard-formatters";
import type { DashboardAlert } from "@/lib/types";

export function DashboardAlertsSection({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Alertas</h2>
      <p className="mt-1 text-sm app-muted">
        Incidencias que requieren seguimiento hoy.
      </p>

      <div className="mt-4 space-y-3">
        {alerts.length === 0 ? (
          <EmptyState
            title="Sin alertas pendientes"
            message="No hay incidencias operativas que requieran seguimiento ahora."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-[1.5rem] border p-4 ${alertClassName(alert)}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words font-black">{alert.title}</div>
                  <div className="mt-1 break-words text-sm">{alert.description}</div>
                </div>
                {alert.href ? (
                  <Link
                    href={alert.href}
                    className="inline-flex w-full shrink-0 justify-center rounded-full border border-current/15 px-3 py-1 text-xs font-bold sm:w-auto"
                  >
                    Abrir
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
