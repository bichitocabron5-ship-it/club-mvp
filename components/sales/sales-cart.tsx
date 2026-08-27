import type { KeyboardEvent, RefObject } from "react";

import { SalesCartItem } from "@/components/sales/sales-cart-item";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  CartInputMode,
  CartLine,
  SalesCartTotals,
  TodayTotals,
} from "@/lib/helpers/sales-cart";

type SalesCartFeedback = {
  kind: "success" | "error";
  title: string;
  message: string;
};

function SalesCartFeedbackMessage({
  feedback,
}: {
  feedback: SalesCartFeedback;
}) {
  const isError = feedback.kind === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`mt-3 rounded-2xl border p-3 text-sm leading-5 ${
        isError
          ? "border-red-200 bg-red-100 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="shrink-0 rounded-full bg-white/85 px-2 py-1 text-xs font-black">
          {isError ? "ERROR" : "OK"}
        </span>
        <div className="min-w-0">
          <p className="font-black">{feedback.title}</p>
          <p className="mt-1">{feedback.message}</p>
        </div>
      </div>
    </div>
  );
}

export function SalesCart({
  cartLines,
  cartTotals,
  invalid,
  loading,
  visibleToday,
  visibleTodayLoading,
  withdrawalFeedback,
  onCartValueKeyDown,
  onCartValueInputRef,
  onNextMember,
  registerButtonRef,
  onRegisterButtonKeyDown,
  onRegisterWithdrawal,
  onRemoveProduct,
  onUpdateAmount,
  onUpdateInputMode,
  onUpdateQty,
}: {
  cartLines: CartLine[];
  cartTotals: SalesCartTotals;
  invalid: boolean;
  loading: boolean;
  visibleToday: TodayTotals;
  visibleTodayLoading: boolean;
  withdrawalFeedback: SalesCartFeedback | null;
  onCartValueKeyDown: (
    productId: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => void;
  onCartValueInputRef: (
    productId: number,
    node: HTMLInputElement | null
  ) => void;
  onNextMember: () => void;
  registerButtonRef: RefObject<HTMLButtonElement | null>;
  onRegisterButtonKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onRegisterWithdrawal: () => void;
  onRemoveProduct: (productId: number) => void;
  onUpdateAmount: (productId: number, value: string) => void;
  onUpdateInputMode: (productId: number, inputMode: CartInputMode) => void;
  onUpdateQty: (productId: number, value: string) => void;
}) {
  return (
    <aside className="app-panel-strong flex min-w-0 flex-col overflow-hidden rounded-3xl md:sticky md:top-24 md:max-h-[calc(100dvh-7rem)] md:self-start">
      <div className="min-h-0 p-4 md:flex-1 md:overflow-y-auto md:pb-4">
        <h2 className="mb-3 text-lg font-bold">Carrito</h2>

        {cartLines.length === 0 && (
          <EmptyState message="Añade productos para registrar una retirada." />
        )}

        <div className="space-y-3">
          {cartLines.map((line) => (
            <SalesCartItem
              key={line.productId}
              line={line}
              onCartValueKeyDown={onCartValueKeyDown}
              onCartValueInputRef={onCartValueInputRef}
              onRemoveProduct={onRemoveProduct}
              onUpdateAmount={onUpdateAmount}
              onUpdateInputMode={onUpdateInputMode}
              onUpdateQty={onUpdateQty}
            />
          ))}
        </div>

        {visibleTodayLoading ? (
          <div className="mt-3 rounded-2xl border border-black/8 bg-white/80 p-3 text-sm">
            Cargando límites del socio...
          </div>
        ) : (
          <>
            <div className="mt-3 rounded-2xl border border-black/8 bg-white/80 p-3 text-sm">
              Con carrito:{" "}
              <strong
                className={
                  cartTotals.overGrams ? "text-red-700" : "text-emerald-700"
                }
              >
                {cartTotals.gramsAfter.toFixed(2)} g
              </strong>
              {" · "}
              <strong
                className={
                  cartTotals.overUnits ? "text-red-700" : "text-emerald-700"
                }
              >
                {cartTotals.unitsAfter.toFixed(0)} ud
              </strong>
              {visibleToday.limits.monthlyLimitG !== null ? (
                <>
                  {" / "}
                  <strong
                    className={
                      cartTotals.overMonthly
                        ? "text-red-700"
                        : "text-emerald-700"
                    }
                  >
                    {cartTotals.monthGramsAfter.toFixed(2)} /{" "}
                    {visibleToday.limits.monthlyLimitG} g mes
                  </strong>
                </>
              ) : null}
            </div>

            {cartTotals.overGrams && (
              <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
                Se supera el límite diario de {visibleToday.limits.dailyLimitG}{" "}
                g.
              </div>
            )}

            {cartTotals.overUnits && (
              <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
                Se supera el límite diario de {visibleToday.limits.dailyLimitUd}{" "}
                ud.
              </div>
            )}

            {cartTotals.overMonthly &&
              visibleToday.limits.monthlyLimitG !== null && (
                <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
                  Se supera el límite mensual de{" "}
                  {visibleToday.limits.monthlyLimitG} g.
                </div>
              )}
          </>
        )}

        {cartTotals.stockProblems.length > 0 && (
          <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
            Hay productos sin stock suficiente.
          </div>
        )}

        {cartTotals.conversionProblems.length > 0 && (
          <div
            role="alert"
            aria-atomic="true"
            className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700"
          >
            Revisa el carrito: hay líneas con errores de conversión. Corrígelas
            antes de registrar.
          </div>
        )}

        {withdrawalFeedback && (
          <SalesCartFeedbackMessage feedback={withdrawalFeedback} />
        )}

        <button
          type="button"
          onClick={onNextMember}
          className="app-button-secondary mt-3 min-h-11 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          Siguiente socio
        </button>
      </div>

      <div className="border-t border-black/10 bg-white px-3 py-3 shadow-[0_-10px_24px_rgba(22,20,18,0.1)] md:sticky md:bottom-0 md:z-20">
        <div className="rounded-2xl bg-[#0b0b0c] px-3 py-2.5 text-white">
          <div className="flex items-center justify-between gap-3 text-xs leading-5">
            <span className="opacity-75">Subtotal original</span>
            <span className="min-w-0 text-right font-bold tabular-nums">
              {cartTotals.cartOriginalTotal.toFixed(2)} EUR
            </span>
          </div>

          {cartTotals.cartDiscountTotal > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs leading-5">
              <span className="opacity-75">Descuento</span>
              <span className="min-w-0 text-right font-bold text-[#d8d0c1] tabular-nums">
                -{cartTotals.cartDiscountTotal.toFixed(2)} EUR
              </span>
            </div>
          )}

          <div className="mt-2 flex items-end justify-between gap-3 border-t border-white/12 pt-2">
            <span className="pb-0.5 text-sm font-semibold opacity-85">
              Total retirada
            </span>
            <span className="min-w-0 text-right text-2xl font-black leading-none tabular-nums lg:text-3xl">
              {cartTotals.cartTotal.toFixed(2)} EUR
            </span>
          </div>
        </div>

        <button
          ref={registerButtonRef}
          type="button"
          onClick={onRegisterWithdrawal}
          onKeyDown={onRegisterButtonKeyDown}
          disabled={invalid || loading}
          className="app-button-primary mt-3 min-h-14 w-full rounded-3xl px-4 py-3.5 text-lg font-black leading-tight shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:opacity-40 lg:text-xl"
        >
          {loading ? "Registrando..." : "COBRAR / REGISTRAR"}
        </button>
      </div>
    </aside>
  );
}
