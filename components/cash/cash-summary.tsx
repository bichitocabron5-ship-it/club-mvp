import { formatCurrency } from "@/lib/helpers/cash-formatters";
import type { DayClosure, DayClosureSummary } from "@/lib/types";

function SummaryCard({
  label,
  value,
  helper,
  valueClassName = "text-2xl font-black text-[#201f1d]",
  accent = "brand",
}: {
  label: string;
  value: string;
  helper?: string;
  valueClassName?: string;
  accent?: "brand" | "sand" | "ink" | "danger" | "success";
}) {
  const accentClassName = {
    brand: "bg-[#a7282d]",
    sand: "bg-[#b4a78d]",
    ink: "bg-[#0b0b0c]",
    danger: "bg-red-500",
    success: "bg-emerald-500",
  }[accent];

  return (
    <div className="app-panel relative min-w-0 overflow-hidden rounded-[1.5rem] p-4">
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${accentClassName}`}
      />

      <div className="text-[0.68rem] font-black uppercase tracking-[0.11em] app-muted">
        {label}
      </div>

      <div className={`mt-3 break-words tabular-nums tracking-[-0.03em] ${valueClassName}`}>
        {value}
      </div>

      {helper ? (
        <div className="mt-2 text-xs leading-5 app-muted">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export function CashSummary({
  summary,
  closure,
  isClosed,
  expectedCash,
  countedValue,
  draftDifference,
}: {
  summary: DayClosureSummary | null;
  closure: DayClosure | null;
  isClosed: boolean;
  expectedCash: number;
  countedValue: number;
  draftDifference: number;
}) {
  const difference = Number(isClosed ? closure?.difference : draftDifference);

  return (
    <section className="app-panel-strong overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
            Resumen financiero
          </span>
        </div>

        <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
          Caja del día
        </h2>

        <p className="mt-1 text-sm app-muted">
          Resumen operativo de ventas, movimientos y efectivo.
        </p>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            label="Caja inicial"
            value={formatCurrency(Number(summary?.openingCash || 0))}
            helper="Base registrada en apertura"
            accent="sand"
          />

          <SummaryCard
            label="Ventas"
            value={formatCurrency(Number(summary?.salesTotal || 0))}
            helper={`${summary?.salesCount || 0} tickets hoy`}
            valueClassName="text-2xl font-black text-[#a7282d]"
            accent="brand"
          />

          <SummaryCard
            label="Gastos efectivo"
            value={formatCurrency(Number(summary?.expensesTotal || 0))}
            helper="Gastos pagados en caja"
            valueClassName="text-2xl font-black text-red-700"
            accent="danger"
          />

          <SummaryCard
            label="Ingresos caja"
            value={formatCurrency(Number(summary?.totalIncome || 0))}
            helper={`${summary?.cashMovesCount || 0} movimientos`}
            accent="ink"
          />

          <SummaryCard
            label="Movimientos manuales"
            value={formatCurrency(Number(summary?.manualCashTotal || 0))}
            helper="Ajuste neto no automático"
            accent="sand"
          />

          <SummaryCard
            label="Descuentos"
            value={formatCurrency(Number(summary?.discountsTotal || 0))}
            helper="Impacto aplicado en ventas"
            valueClassName="text-2xl font-black text-[#861f23]"
            accent="brand"
          />
        </div>

        <div className="h-px bg-black/7" />

        <div>
          <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] app-muted">
            Cierre de caja
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard
              label="Caja esperada"
              value={formatCurrency(expectedCash)}
              accent="brand"
            />

            <SummaryCard
              label="Caja contada"
              value={
                isClosed
                  ? formatCurrency(Number(closure?.countedCash || 0))
                  : formatCurrency(countedValue)
              }
              accent="sand"
            />

            <SummaryCard
              label="Diferencia"
              value={
                isClosed
                  ? formatCurrency(Number(closure?.difference || 0))
                  : formatCurrency(draftDifference)
              }
              valueClassName={`text-2xl font-black ${
                difference === 0 ? "text-emerald-700" : "text-red-700"
              }`}
              accent={difference === 0 ? "success" : "danger"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
