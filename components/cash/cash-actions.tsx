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
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 font-black"
            >
              !
            </span>

            <div>
              <div className="font-black">Se ha producido un error</div>
              <div className="mt-1 leading-6">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      {autoCheckoutMessage ? (
        <div
          role="status"
          className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-black"
            >
              ✓
            </span>

            <div>
              <div className="font-black">Operación completada</div>
              <div className="mt-1 leading-6">{autoCheckoutMessage}</div>
            </div>
          </div>
        </div>
      ) : null}

      {hasOpenInventoryCounts ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-black"
            >
              !
            </span>

            <div>
              <div className="font-black">Conteos de inventario pendientes</div>

              <div className="mt-1 leading-6">
                Hay {inventoryCountsOpenCount} conteo
                {inventoryCountsOpenCount === 1 ? "" : "s"} abierto
                {inventoryCountsOpenCount === 1 ? "" : "s"} hoy. Revisa los
                conteos antes de cerrar o vincula el conteo confirmado
                correspondiente.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {accessStatus.count > 0 ? (
        <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/85">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-[2px] w-5 rounded-full bg-[#a7282d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                    Accesos pendientes
                  </span>
                </div>

                <div className="text-lg font-black text-[#201f1d]">
                  {accessStatus.count} socio
                  {accessStatus.count === 1 ? "" : "s"} dentro
                </div>

                <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                  Antes de cerrar la jornada puedes registrar automáticamente la
                  salida de todos los socios que siguen dentro.
                </p>
              </div>

              <button
                type="button"
                onClick={onAutoCheckout}
                disabled={saving}
                className="app-button-primary inline-flex w-full shrink-0 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saving ? "Procesando..." : "Marcar salida de todos"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReopened && closure?.reopenedAt ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-black"
            >
              ↺
            </span>

            <div>
              <div className="font-black">Jornada reabierta</div>

              <div className="mt-1 leading-6">
                El cierre de hoy fue reabierto el{" "}
                {formatDateTime(closure.reopenedAt)}.
              </div>

              {closure.reopenReason ? (
                <div className="mt-2 rounded-xl border border-amber-200/70 bg-white/45 px-3 py-2">
                  <span className="font-bold">Motivo:</span>{" "}
                  {closure.reopenReason}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
