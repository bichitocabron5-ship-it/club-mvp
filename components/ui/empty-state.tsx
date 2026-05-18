export function EmptyState({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`app-panel rounded-2xl p-4 text-sm leading-6 app-muted ${className}`.trim()}
    >
      {message}
    </div>
  );
}
