import { formatDateTime } from "@/lib/helpers/dashboard-formatters";

export function DashboardStatusBar({
  generatedAt,
  isRefreshing,
  refreshError,
  onRefresh,
}: {
  generatedAt: string;
  isRefreshing: boolean;
  refreshError: string;
  onRefresh: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[1.5rem] border border-black/8 bg-white/75 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="font-semibold">
          {isRefreshing ? "Actualizando..." : "Panel actualizado"}
        </div>
        <div className="mt-1 app-muted">
          Ultima lectura: {formatDateTime(generatedAt)}
        </div>
        {refreshError ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            {refreshError}. Se mantienen los datos anteriores.
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="app-button-secondary inline-flex items-center justify-center rounded-full px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRefreshing ? "Actualizando..." : "Refrescar"}
      </button>
    </div>
  );
}
