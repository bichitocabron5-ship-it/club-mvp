import type { DashboardComparisonMetric } from "@/lib/types";

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value || 0).toFixed(2)}%`;
}

function comparisonToneClassName(deltaPercent: number | null) {
  if (deltaPercent === null || deltaPercent === 0) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  return deltaPercent > 0
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-red-200 bg-red-100 text-red-800";
}

function comparisonLabel(comparison: DashboardComparisonMetric) {
  if (comparison.deltaPercent === null) {
    return "= Sin porcentaje vs ayer";
  }

  if (comparison.deltaPercent > 0) {
    return `Sube ${formatSignedPercent(comparison.deltaPercent)} vs ayer`;
  }

  if (comparison.deltaPercent < 0) {
    return `Baja ${formatSignedPercent(comparison.deltaPercent)} vs ayer`;
  }

  return `= Sin cambio ${formatSignedPercent(comparison.deltaPercent)} vs ayer`;
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
    <div className={`app-panel rounded-3xl p-4 md:p-5 ${className}`.trim()}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] app-muted">
        {label}
      </div>
      <div className={valueClassName}>{value}</div>
      {comparison ? (
        <div
          className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${comparisonToneClassName(
            comparison.deltaPercent
          )}`}
        >
          {comparisonLabel(comparison)}
        </div>
      ) : null}
    </div>
  );
}
