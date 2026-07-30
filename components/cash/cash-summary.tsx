import { formatCurrency } from "@/lib/helpers/cash-formatters";
import type { DayClosure, DayClosureSummary } from "@/lib/types";

function SummaryCard({
  label,
  value,
  helper,
  valueClassName = "mt-1 text-2xl font-black",
}: {
  label: string;
  value: string;
  helper?: string;
  valueClassName?: string;
}) {
  return (
    <div className="app-panel rounded-3xl p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={valueClassName}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-gray-500">{helper}</div> : null}
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
    <>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Caja inicial"
          value={formatCurrency(Number(summary?.openingCash || 0))}
          helper="Base registrada en apertura"
        />
        <SummaryCard
          label="Ventas"
          value={formatCurrency(Number(summary?.salesTotal || 0))}
          helper={`${summary?.salesCount || 0} tickets hoy`}
        />
        <SummaryCard
          label="Gastos efectivo"
          value={formatCurrency(Number(summary?.expensesTotal || 0))}
          helper="Gastos pagados en caja"
        />
        <SummaryCard
          label="Ingresos caja"
          value={formatCurrency(Number(summary?.totalIncome || 0))}
          helper={`${summary?.cashMovesCount || 0} movimientos`}
        />
        <SummaryCard
          label="Mov. manuales"
          value={formatCurrency(Number(summary?.manualCashTotal || 0))}
          helper="Ajuste neto no automatico"
        />
        <SummaryCard
          label="Descuentos"
          value={formatCurrency(Number(summary?.discountsTotal || 0))}
          helper="Impacto aplicado en ventas"
        />
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <SummaryCard label="Caja esperada" value={formatCurrency(expectedCash)} />
        <SummaryCard
          label="Caja contada"
          value={
            isClosed
              ? formatCurrency(Number(closure?.countedCash || 0))
              : formatCurrency(countedValue)
          }
        />
        <SummaryCard
          label="Diferencia"
          value={
            isClosed
              ? formatCurrency(Number(closure?.difference || 0))
              : formatCurrency(draftDifference)
          }
          valueClassName={`mt-1 text-2xl font-black ${
            difference === 0 ? "text-green-700" : "text-red-700"
          }`}
        />
      </div>
    </>
  );
}
