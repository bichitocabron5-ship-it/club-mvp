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
            message="Sin alertas operativas pendientes."
            className="rounded-[1.5rem]"
          />
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-[1.5rem] border p-4 ${alertClassName(alert)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black">{alert.title}</div>
                  <div className="mt-1 text-sm">{alert.description}</div>
                </div>
                {alert.href ? (
                  <Link
                    href={alert.href}
                    className="rounded-full border border-current/15 px-3 py-1 text-xs font-bold"
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
