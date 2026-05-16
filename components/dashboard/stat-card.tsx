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
    <div className={`rounded border p-4 ${className}`.trim()}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={valueClassName}>{value}</div>
    </div>
  );
}
