export function StatCard({
  label,
  value,
  className = "",
  valueClassName = "text-2xl font-black",
}: {
  label: string;
  value: string | number;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`app-panel rounded-3xl p-4 md:p-5 ${className}`.trim()}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] app-muted">
        {label}
      </div>
      <div className={valueClassName}>{value}</div>
    </div>
  );
}
