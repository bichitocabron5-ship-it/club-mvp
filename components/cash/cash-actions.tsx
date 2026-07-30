import { formatDateTime } from "@/lib/helpers/cash-formatters";
import type { AccessCurrentResponse, DayClosure } from "@/lib/types";

export function CashActions({
  error,
  autoCheckoutMessage,
  inventoryCountsOpenCount,
  accessStatus,
  isReopened,
  closure,
  saving,
  onAutoCheckout,
}: {
  error: string;
  autoCheckoutMessage: string;
  inventoryCountsOpenCount: number;
  accessStatus: AccessCurrentResponse;
  isReopened: boolean;
  closure: DayClosure | null;
  saving: boolean;
  onAutoCheckout: () => void;
}) {
  const hasOpenInventoryCounts = inventoryCountsOpenCount > 0;

  return (
    <>
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {autoCheckoutMessage ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {autoCheckoutMessage}
        </div>
      ) : null}

      {hasOpenInventoryCounts ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Hay {inventoryCountsOpenCount} conteo(s) abiertos hoy. Revisa los
          conteos abiertos antes de cerrar o vincula el conteo confirmado
          correspondiente.
        </div>
      ) : null}

      {accessStatus.count > 0 ? (
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div>
            Quedan {accessStatus.count} socio(s) dentro. Puedes marcar salida
            automatica antes de cerrar.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onAutoCheckout}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-60"
              disabled={saving}
            >
              Marcar salida de todos
            </button>
          </div>
        </div>
      ) : null}

      {isReopened && closure?.reopenedAt ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El cierre de hoy fue reabierto el {formatDateTime(closure.reopenedAt)}.
          {closure.reopenReason ? ` Motivo: ${closure.reopenReason}` : ""}
        </div>
      ) : null}
    </>
  );
}
