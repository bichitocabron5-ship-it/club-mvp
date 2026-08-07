export function EmptyState({
  title,
  message,
  className = "",
}: {
  title?: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`app-panel min-w-0 rounded-2xl p-4 text-sm leading-6 app-muted ${className}`.trim()}
    >
      {title ? (
        <>
          <h3 className="text-sm font-black text-[var(--foreground)]">
            {title}
          </h3>
          <p className="mt-1">{message}</p>
        </>
      ) : (
        message
      )}
    </div>
  );
}
