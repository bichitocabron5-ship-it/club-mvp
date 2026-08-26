import { EmptyState } from "@/components/ui/empty-state";
import {
  formatAccessType,
  formatTime,
} from "@/lib/helpers/dashboard-formatters";
import type { DashboardAccessLog, DashboardData } from "@/lib/types";

function AccessLogItem({
  log,
  backgroundClassName,
}: {
  log: DashboardAccessLog;
  backgroundClassName: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[1.25rem] border border-black/8 ${backgroundClassName} p-3.5 transition-all hover:border-[#a7282d]/20 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)] sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="min-w-0">
        <div className="break-words font-semibold">{log.member.fullName}</div>
        <div className="break-words text-sm app-muted">{log.member.dni}</div>
      </div>
      <div className="shrink-0 text-left sm:text-right">
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
            log.type === "IN"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#6d6860]"
          }`}
        >
          {formatAccessType(log.type)}
        </div>
        <div className="mt-1 text-xs app-muted">{formatTime(log.createdAt)}</div>
      </div>
    </div>
  );
}

export function DashboardStaffAccessSection({
  accessLogs,
}: {
  accessLogs: DashboardAccessLog[];
}) {
  return (
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Últimos accesos</h2>
      <p className="mt-1 text-sm app-muted">
        Movimiento reciente de socios en el acceso.
      </p>

      <div className="mt-4 space-y-2">
        {accessLogs.length === 0 ? (
          <EmptyState
            title="Sin accesos registrados"
            message="Cuando haya movimientos de entrada o salida apareceran aqui."
            className="rounded-[1.5rem] bg-white/70"
          />
        ) : (
          accessLogs.map((log) => (
            <AccessLogItem key={log.id} log={log} backgroundClassName="bg-white/80" />
          ))
        )}
      </div>
    </section>
  );
}

export function DashboardAccessSection({ data }: { data: DashboardData }) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />
          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
            Acceso
          </span>
        </div>

        <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
          Actividad de socios
        </h2>

        <p className="mt-1 text-sm app-muted">
          Entradas registradas hoy y personas actualmente dentro.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#a7282d]" />

            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Socios con entrada hoy
            </div>

            <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              {data.summary.activeMembersToday}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]/90 p-4">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#b4a78d]" />

            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Dentro ahora
            </div>

            <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#861f23]">
              {data.summary.currentInsideCount}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {data.recentAccessLogs.length === 0 ? (
            <EmptyState
              title="Sin accesos recientes"
              message="No hay movimientos de socios en esta lectura del panel."
              className="rounded-[1.5rem] bg-white/70"
            />
          ) : (
            data.recentAccessLogs.map((log) => (
              <AccessLogItem
                key={log.id}
                log={log}
                backgroundClassName="bg-white/88"
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
