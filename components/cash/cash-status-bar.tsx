import {
  closureStatusClassName,
  closureStatusMessage,
  formatClosureStatus,
  formatDateTime,
} from "@/lib/helpers/cash-formatters";
import type { DashboardClosureStatus, DayClosure } from "@/lib/types";

export function CashStatusBar({
  dayStatus,
  closure,
  csvHref,
}: {
  dayStatus: DashboardClosureStatus;
  closure: DayClosure | null;
  csvHref: string;
}) {
  return (
    <section className="app-panel overflow-hidden rounded-[2rem]">
      <div
        className={`border-l-4 px-5 py-5 sm:px-6 ${closureStatusClassName(
          dayStatus,
        )}`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-current opacity-70" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] opacity-75">
                Estado operativo
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black tracking-[-0.03em]">
                {formatClosureStatus(dayStatus)}
              </h2>

              <span className="inline-flex items-center gap-2 rounded-full border border-current/15 bg-white/45 px-3 py-1 text-xs font-bold">
                <span className="h-2 w-2 rounded-full bg-current" />
                Caja
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6">
              {closureStatusMessage(dayStatus)}
            </p>

            {closure?.openedAt ? (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-current/10 pt-4 text-xs">
                <div>
                  <span className="font-bold">Apertura:</span>{" "}
                  {formatDateTime(closure.openedAt)}
                </div>

                {closure.openedByUser?.name ? (
                  <div>
                    <span className="font-bold">Responsable:</span>{" "}
                    {closure.openedByUser.name}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <a
            href={csvHref}
            className="inline-flex w-full shrink-0 items-center justify-center rounded-xl border border-current/15 bg-white/55 px-4 py-2.5 text-xs font-bold transition-all hover:bg-white/80 sm:w-auto"
          >
            Exportar CSV
          </a>
        </div>
      </div>
    </section>
  );
}
