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
    <div
      className={`mb-4 rounded-2xl border p-4 text-sm ${closureStatusClassName(
        dayStatus
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-black">{formatClosureStatus(dayStatus)}</div>
          <div className="mt-1">{closureStatusMessage(dayStatus)}</div>
          {closure?.openedAt ? (
            <div className="mt-1 text-xs">
              Apertura: {formatDateTime(closure.openedAt)}
              {closure.openedByUser?.name
                ? ` - ${closure.openedByUser.name}`
                : ""}
            </div>
          ) : null}
        </div>
        <a
          className="rounded-full border border-current/15 px-4 py-2 text-xs font-bold"
          href={csvHref}
        >
          Exportar CSV
        </a>
      </div>
    </div>
  );
}
