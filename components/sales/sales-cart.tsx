import type { KeyboardEvent } from "react";

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
          : "border-green-200 bg-green-100 text-green-800"
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
  onCartValueKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCartValueInputRef: (
    productId: number,
    node: HTMLInputElement | null
  ) => void;
  onNextMember: () => void;
  onRegisterButtonKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onRegisterWithdrawal: () => void;
  onRemoveProduct: (productId: number) => void;
  onUpdateAmount: (productId: number, value: string) => void;
  onUpdateInputMode: (productId: number, inputMode: CartInputMode) => void;
  onUpdateQty: (productId: number, value: string) => void;
}) {
  return (
    <aside className="app-panel-strong rounded-3xl p-4 xl:sticky xl:top-24 xl:self-start">
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

      <div className="mt-4 rounded-3xl bg-gray-900 p-4 text-white">
        <div className="text-sm opacity-80">Subtotal original</div>
        <div className="text-2xl font-bold">
          {cartTotals.cartOriginalTotal.toFixed(2)} EUR
        </div>
        <div className="mt-3 text-sm opacity-80">Descuento</div>
        <div className="text-2xl font-bold text-blue-200">
          -{cartTotals.cartDiscountTotal.toFixed(2)} EUR
        </div>
        <div className="mt-3 text-sm opacity-80">Total retirada</div>
        <div className="text-5xl font-black">
          {cartTotals.cartTotal.toFixed(2)} EUR
        </div>
      </div>

      {visibleTodayLoading ? (
        <div className="mt-3 rounded-2xl border border-black/8 bg-white/80 p-3 text-sm">
          Cargando limites del socio...
        </div>
      ) : (
        <>
      <div className="mt-3 rounded-2xl border border-black/8 bg-white/80 p-3 text-sm">
        Con carrito:{" "}
        <strong
          className={cartTotals.overGrams ? "text-red-600" : "text-green-700"}
        >
          {cartTotals.gramsAfter.toFixed(2)} g
        </strong>
        {" · "}
        <strong
          className={cartTotals.overUnits ? "text-red-600" : "text-green-700"}
        >
          {cartTotals.unitsAfter.toFixed(0)} ud
        </strong>
        {visibleToday.limits.monthlyLimitG !== null ? (
          <>
            {" / "}
            <strong
              className={
                cartTotals.overMonthly ? "text-red-600" : "text-green-700"
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
          Se supera el límite diario de {visibleToday.limits.dailyLimitG} g.
        </div>
      )}

      {cartTotals.overUnits && (
        <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          Se supera el límite diario de {visibleToday.limits.dailyLimitUd} ud.
        </div>
      )}

      {cartTotals.overMonthly && visibleToday.limits.monthlyLimitG !== null && (
        <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          Se supera el límite mensual de {visibleToday.limits.monthlyLimitG} g.
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
          Revisa el carrito: hay lineas con errores de conversion. Corrigelas
          antes de registrar.
        </div>
      )}

      {withdrawalFeedback && (
        <SalesCartFeedbackMessage feedback={withdrawalFeedback} />
      )}

      <button
        type="button"
        onClick={onRegisterWithdrawal}
        onKeyDown={onRegisterButtonKeyDown}
        disabled={invalid || loading}
        className="app-button-primary mt-4 w-full rounded-3xl p-6 text-2xl font-black shadow-lg disabled:opacity-40"
      >
        {loading ? "Registrando..." : "COBRAR / REGISTRAR"}
      </button>

      <button
        type="button"
        onClick={onNextMember}
        className="app-button-secondary mt-3 min-h-12 w-full rounded-2xl px-5 py-4 text-base font-bold"
      >
        Siguiente socio
      </button>
    </aside>
  );
}
