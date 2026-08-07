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
      className={`flex flex-col gap-3 rounded-[1.25rem] border border-black/8 ${backgroundClassName} p-3 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="min-w-0">
        <div className="break-words font-semibold">{log.member.fullName}</div>
        <div className="break-words text-sm app-muted">{log.member.dni}</div>
      </div>
      <div className="shrink-0 text-left sm:text-right">
        <div
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
            log.type === "IN"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-sky-100 text-sky-700"
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
    <section className="app-panel rounded-[2rem] p-5">
      <h2 className="text-lg font-black">Actividad de socios</h2>
      <p className="mt-1 text-sm app-muted">
        Acceso de hoy y personas actualmente dentro.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Socios con entrada hoy</div>
          <div className="mt-1 text-3xl font-black">{data.summary.activeMembersToday}</div>
        </div>
        <div className="rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
          <div className="text-sm app-muted">Dentro ahora</div>
          <div className="mt-1 text-3xl font-black">{data.summary.currentInsideCount}</div>
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
            <AccessLogItem key={log.id} log={log} backgroundClassName="bg-white/85" />
          ))
        )}
      </div>
    </section>
  );
}
