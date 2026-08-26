import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { alertClassName } from "@/lib/helpers/dashboard-formatters";
import type { DashboardAlert } from "@/lib/types";

export function DashboardAlertsSection({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`h-[2px] w-6 rounded-full ${
                  alerts.length > 0 ? "bg-red-500" : "bg-emerald-500"
                }`}
              />

              <span
                className={`text-[0.65rem] font-black uppercase tracking-[0.2em] ${
                  alerts.length > 0 ? "text-red-700" : "text-emerald-700"
                }`}
              >
                Supervisión
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Alertas
            </h2>

            <p className="mt-1 text-sm app-muted">
              Incidencias que requieren seguimiento.
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              alerts.length > 0
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {alerts.length > 0
              ? `${alerts.length} pendiente${alerts.length === 1 ? "" : "s"}`
              : "Todo correcto"}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {alerts.length === 0 ? (
          <EmptyState
            title="Sin alertas pendientes"
            message="No hay incidencias operativas que requieran seguimiento ahora."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          alerts.map((alert, index) => (
            <div
              key={alert.id}
              className={`relative overflow-hidden rounded-[1.5rem] border p-4 ${alertClassName(
                alert,
              )}`}
            >
              <div className="absolute inset-y-0 left-0 w-[3px] bg-current/35" />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-black/8 px-2 text-xs font-black">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0">
                    <div className="break-words font-black">
                      {alert.title}
                    </div>

                    <div className="mt-1 break-words text-sm leading-5">
                      {alert.description}
                    </div>
                  </div>
                </div>

                {alert.href ? (
                  <Link
                    href={alert.href}
                    className="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-full border border-current/15 bg-white/40 px-3 py-1.5 text-xs font-bold transition-all hover:bg-white/70 sm:w-auto"
                  >
                    Abrir
                    <span aria-hidden="true">→</span>
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
