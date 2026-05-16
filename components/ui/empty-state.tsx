export function EmptyState({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div className={`rounded bg-gray-50 p-3 text-sm text-gray-500 ${className}`.trim()}>
      {message}
    </div>
  );
}
