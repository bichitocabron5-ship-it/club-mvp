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
      className={`app-panel group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(22,20,18,0.12)] md:p-5 ${className}`.trim()}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#a7282d] via-[#c84a4f] to-[#b4a78d] opacity-80" />

      <div className="flex items-center justify-between gap-3">
        <div className="break-words text-[0.68rem] font-black uppercase leading-4 tracking-[0.14em] text-[#6d6860]">
          {label}
        </div>

        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-[#a7282d]/70"
        />
      </div>

      <div
        className={`mt-3 break-words leading-tight tabular-nums tracking-[-0.03em] ${valueClassName}`}
      >
        {value}
      </div>

      {comparison ? (
        <ComparisonBadge label={label} comparison={comparison} />
      ) : (
        <div className="mt-auto pt-4">
          <div className="h-px w-full bg-gradient-to-r from-black/8 to-transparent" />
        </div>
      )}
    </div>
  );
}
