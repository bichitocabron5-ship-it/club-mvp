import type { DashboardComparisonMetric } from "@/lib/types";

type ComparisonBadgeMeta = {
  label: string;
  symbol: string;
  className: string;
  symbolClassName: string;
};

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value || 0).toFixed(2)}%`;
}

function comparisonBadgeMeta(
  comparison: DashboardComparisonMetric
): ComparisonBadgeMeta {
  if (comparison.deltaPercent === null) {
    return {
      label: "Sin porcentaje disponible vs ayer",
      symbol: "N/D",
      className: "border-dashed border-slate-300 bg-white/80 text-slate-700",
      symbolClassName: "bg-slate-200 text-slate-800",
    };
  }

  if (comparison.deltaPercent > 0) {
    return {
      label: `Sube ${formatSignedPercent(comparison.deltaPercent)} vs ayer`,
      symbol: "+",
      className: "border-emerald-300 bg-emerald-50 text-emerald-900",
      symbolClassName: "bg-emerald-200 text-emerald-950",
    };
  }

  if (comparison.deltaPercent < 0) {
    return {
      label: `Baja ${formatSignedPercent(comparison.deltaPercent)} vs ayer`,
      symbol: "-",
      className: "border-red-300 bg-red-50 text-red-900",
      symbolClassName: "bg-red-200 text-red-950",
    };
  }

  return {
    label: `Sin cambio ${formatSignedPercent(comparison.deltaPercent)} vs ayer`,
    symbol: "=",
    className: "border-slate-300 bg-slate-100 text-slate-800",
    symbolClassName: "bg-slate-300 text-slate-950",
  };
}

function ComparisonBadge({
  label,
  comparison,
}: {
  label: string;
  comparison: DashboardComparisonMetric;
}) {
  const meta = comparisonBadgeMeta(comparison);

  return (
    <div
      className={`mt-3 inline-flex max-w-full self-start items-center gap-1.5 rounded-2xl border px-2 py-1.5 text-xs font-semibold leading-tight ${meta.className}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[0.62rem] font-black leading-none ${meta.symbolClassName}`}
      >
        {meta.symbol}
      </span>
      <span className="min-w-0 break-words">
        <span className="sr-only">Comparativa de {label}: </span>
        {meta.label}
      </span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  comparison,
  className = "",
  valueClassName = "text-2xl font-black",
}: {
  label: string;
  value: string | number;
  comparison?: DashboardComparisonMetric;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`app-panel flex h-full min-w-0 flex-col rounded-3xl p-4 md:p-5 ${className}`.trim()}
    >
      <div className="break-words text-xs font-semibold uppercase leading-4 app-muted">
        {label}
      </div>
      <div className={`mt-2 break-words leading-tight tabular-nums ${valueClassName}`}>
        {value}
      </div>
      {comparison ? <ComparisonBadge label={label} comparison={comparison} /> : null}
    </div>
  );
}
