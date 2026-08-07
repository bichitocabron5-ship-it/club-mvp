import {
  formatClosureStatus,
  formatCurrency,
} from "@/lib/helpers/dashboard-formatters";
import { EmptyState } from "@/components/ui/empty-state";
import type { DashboardCashSummary } from "@/lib/types";

function closureStatusClassName(status: DashboardCashSummary["dayClosureStatus"] | undefined) {
  if (status === "CLOSED") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (status === "REOPENED" || status === "PENDING") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-sky-100 text-sky-800";
}

export function DashboardCashSection({ cash }: { cash: DashboardCashSummary | null }) {
  return (
    <section className="app-panel-strong rounded-[2rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Caja del día</h2>
          <p className="mt-1 text-sm app-muted">
            Estado actual del cierre y caja esperada.
          </p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs font-bold ${closureStatusClassName(
            cash?.dayClosureStatus
          )}`}
        >
          {formatClosureStatus(cash?.dayClosureStatus)}
        </div>
      </div>

      {cash ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-xs uppercase app-muted">Caja esperada</div>
            <div className="mt-2 break-words text-2xl font-black">
              {formatCurrency(cash.cashExpectedToday)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-xs uppercase app-muted">Balance caja</div>
            <div className="mt-2 break-words text-2xl font-black">
              {formatCurrency(cash.cashBalanceToday)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-xs uppercase app-muted">Gastos caja</div>
            <div className="mt-2 break-words text-2xl font-black text-red-700">
              {formatCurrency(cash.expensesTodayTotal)}
            </div>
          </div>
          <div className="min-w-0 rounded-[1.5rem] border border-black/8 bg-white/85 p-4">
            <div className="text-xs uppercase app-muted">Diferencia cierre</div>
            <div
              className={`mt-2 break-words text-2xl font-black ${
                Number(cash.dayClosureDifference || 0) === 0
                  ? "text-emerald-700"
                  : "text-red-700"
              }`}
            >
              {cash.dayClosureDifference === null
                ? "Pendiente"
                : formatCurrency(cash.dayClosureDifference)}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Sin resumen de caja"
          message="No hay datos de caja disponibles para esta lectura del panel."
          className="mt-4 rounded-[1.5rem] bg-white/70"
        />
      )}
    </section>
  );
}
