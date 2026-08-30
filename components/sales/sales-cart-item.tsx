import type { KeyboardEvent } from "react";

import {
  formatQtyInput,
  formatQtyLabel,
} from "@/lib/helpers/sales-formatters";
import type { CartInputMode, CartLine } from "@/lib/helpers/sales-cart";

export function SalesCartItem({
  disabled,
  line,
  onCartValueKeyDown,
  onCartValueInputRef,
  onRemoveProduct,
  onUpdateAmount,
  onUpdateInputMode,
  onUpdateQty,
}: {
  disabled: boolean;
  line: CartLine;
  onCartValueKeyDown: (
    productId: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => void;
  onCartValueInputRef: (
    productId: number,
    node: HTMLInputElement | null
  ) => void;
  onRemoveProduct: (productId: number) => void;
  onUpdateAmount: (productId: number, value: string) => void;
  onUpdateInputMode: (productId: number, inputMode: CartInputMode) => void;
  onUpdateQty: (productId: number, value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white/82 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words font-medium leading-tight">
            {line.product?.name}
          </div>
          <div className="text-sm app-muted">
            Stock: {line.stock.toFixed(2)} {line.product?.unit}
          </div>
          <div className="text-sm app-muted">
            Precio unitario: {line.price.toFixed(2)} EUR /{" "}
            {line.product?.unit === "G" ? "g" : "ud"}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
              Producto agregado
            </span>
            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-[#645b4c]">
              Modo {line.inputMode === "AMOUNT" ? "Por importe" : "Por cantidad"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              onRemoveProduct(line.productId);
            }
          }}
          disabled={disabled}
          className="min-h-11 shrink-0 self-start rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Quitar
        </button>
      </div>

      <div className="mt-3">
        <label className="text-xs app-muted">Modo de entrada</label>
        <select
          className="mt-1 min-h-12 w-full rounded-2xl border border-black/10 bg-white p-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/50"
          value={line.inputMode}
          onChange={(event) =>
            onUpdateInputMode(
              line.productId,
              event.target.value as CartInputMode
            )
          }
          disabled={disabled}
        >
          <option value="AMOUNT">Por importe</option>
          <option value="QTY">Por cantidad</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3">
        <div>
          {line.inputMode === "QTY" ? (
            <>
              <label className="text-xs app-muted">Cantidad</label>

              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      onUpdateQty(
                        line.productId,
                        formatQtyInput(
                          Math.max(
                            0,
                            line.qty -
                              (line.product?.unit === "UD" ? 1 : 0.001)
                          ),
                          line.product?.unit === "UD" ? "UD" : "G"
                        )
                      );
                    }
                  }}
                  disabled={disabled}
                  className="h-12 w-12 shrink-0 rounded-xl bg-[#f3f0e9] text-xl font-bold text-[#201f1d] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  -
                </button>

                <input
                  ref={(node) => onCartValueInputRef(line.productId, node)}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/50"
                  type="number"
                  inputMode={line.product?.unit === "UD" ? "numeric" : "decimal"}
                  step={line.product?.unit === "UD" ? "1" : "0.001"}
                  min="0"
                  value={line.qtyInput}
                  onChange={(event) =>
                    onUpdateQty(line.productId, event.target.value)
                  }
                  onKeyDown={(event) =>
                    onCartValueKeyDown(line.productId, event)
                  }
                  disabled={disabled}
                />

                <button
                  type="button"
                  onClick={() => {
                    if (!disabled) {
                      onUpdateQty(
                        line.productId,
                        formatQtyInput(
                          line.qty + (line.product?.unit === "UD" ? 1 : 0.001),
                          line.product?.unit === "UD" ? "UD" : "G"
                        )
                      );
                    }
                  }}
                  disabled={disabled}
                  className="h-12 w-12 shrink-0 rounded-2xl bg-[#0b0b0c] text-xl font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>

              <div className="mt-2 text-xs app-muted">
                Importe final estimado: {line.finalAmount.toFixed(2)} EUR
              </div>
            </>
          ) : (
            <>
              <label className="text-xs app-muted">Importe en euros</label>
              <input
                ref={(node) => onCartValueInputRef(line.productId, node)}
                className="mt-1 h-12 w-full rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-black/5 disabled:text-black/50"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={line.amountInput}
                onChange={(event) =>
                  onUpdateAmount(line.productId, event.target.value)
                }
                onKeyDown={(event) =>
                  onCartValueKeyDown(line.productId, event)
                }
                disabled={disabled}
              />

              <div className="mt-2 text-xs app-muted">
                Cantidad calculada:{" "}
                {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs app-muted">Cantidad final</label>
            <div className="rounded-2xl border border-black/8 bg-[#f7f4ee] p-2">
              {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
            </div>
          </div>

          <div>
            <label className="text-xs app-muted">
              Importe final estimado
            </label>
            <div className="rounded-2xl border border-black/8 bg-[#f7f4ee] p-2">
              {line.finalAmount.toFixed(2)} EUR
            </div>
          </div>

          <div className="text-xs app-muted">
            Importe base estimado: {line.originalAmount.toFixed(2)} EUR
          </div>

          {line.discountAmount > 0 && (
            <div className="text-xs font-semibold text-[#861f23]">
              Descuento estimado: {line.discountAmount.toFixed(2)} EUR
            </div>
          )}
        </div>
      </div>

      {line.conversionError && (
        <div className="mt-2 rounded-2xl bg-red-100 p-2 text-sm text-red-700">
          {line.conversionError}
        </div>
      )}

      {line.qty > line.stock && (
        <div className="mt-2 rounded-2xl bg-red-100 p-2 text-sm text-red-700">
          Stock insuficiente.
        </div>
      )}
    </div>
  );
}
