import type { KeyboardEvent } from "react";

import { SalesCartItem } from "@/components/sales/sales-cart-item";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  CartInputMode,
  CartLine,
  SalesCartTotals,
  TodayTotals,
} from "@/lib/helpers/sales-cart";

export function SalesCart({
  cartLines,
  cartTotals,
  invalid,
  loading,
  visibleToday,
  onCartValueKeyDown,
  onCartValueInputRef,
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
  onCartValueKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCartValueInputRef: (
    productId: number,
    node: HTMLInputElement | null
  ) => void;
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

      {cartTotals.stockProblems.length > 0 && (
        <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          Hay productos sin stock suficiente.
        </div>
      )}

      {cartTotals.conversionProblems.length > 0 && (
        <div className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">
          Hay lineas con errores de conversion. Corrigelas antes de registrar.
        </div>
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
    </aside>
  );
}
