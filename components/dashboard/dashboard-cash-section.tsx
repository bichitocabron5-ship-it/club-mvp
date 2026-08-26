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
    <section className="app-panel-strong overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />
              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Operaciones
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Caja del día
            </h2>

            <p className="mt-1 text-sm app-muted">
              Estado actual del cierre y caja esperada.
            </p>
          </div>

          <div
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${closureStatusClassName(
              cash?.dayClosureStatus
            )}`}
          >
            {formatClosureStatus(cash?.dayClosureStatus)}
          </div>
        </div>
      </div>

      {cash ? (
        <div className="grid gap-3 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-[#a7282d]" />
            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Caja esperada
            </div>
            <div className="mt-3 break-words text-2xl font-black tracking-[-0.03em] text-[#201f1d]">
              {formatCurrency(cash.cashExpectedToday)}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]/90 p-4">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-[#b4a78d]" />
            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Balance caja
            </div>
            <div className="mt-3 break-words text-2xl font-black tracking-[-0.03em] text-[#201f1d]">
              {formatCurrency(cash.cashBalanceToday)}
            </div>
          </div>

          <div className="relative min-w-0 overflow-hidden rounded-[1.5rem] border border-red-100 bg-red-50/70 p-4">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-red-500/70" />
            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-red-700/75">
              Gastos caja
            </div>
            <div className="mt-3 break-words text-2xl font-black tracking-[-0.03em] text-red-700">
              {formatCurrency(cash.expensesTodayTotal)}
            </div>
          </div>

          <div
            className={`relative min-w-0 overflow-hidden rounded-[1.5rem] border p-4 ${
              Number(cash.dayClosureDifference || 0) === 0
                ? "border-emerald-100 bg-emerald-50/70"
                : "border-red-100 bg-red-50/70"
            }`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-[3px] ${
                Number(cash.dayClosureDifference || 0) === 0
                  ? "bg-emerald-500/70"
                  : "bg-red-500/70"
              }`}
            />

            <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Diferencia cierre
            </div>

            <div
              className={`mt-3 break-words text-2xl font-black tracking-[-0.03em] ${
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
          className="m-5 rounded-[1.5rem] bg-white/70 sm:m-6"
        />
      )}
    </section>
  );
}
