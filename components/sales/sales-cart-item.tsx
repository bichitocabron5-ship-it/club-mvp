import type { KeyboardEvent } from "react";

import {
  formatQtyInput,
  formatQtyLabel,
} from "@/lib/helpers/sales-formatters";
import type { CartInputMode, CartLine } from "@/lib/helpers/sales-cart";

export function SalesCartItem({
  line,
  onCartValueKeyDown,
  onCartValueInputRef,
  onRemoveProduct,
  onUpdateAmount,
  onUpdateInputMode,
  onUpdateQty,
}: {
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
    <div className="rounded-2xl border border-black/8 bg-white/82 p-3">
      <div className="flex justify-between gap-2">
        <div>
          <div className="font-medium">{line.product?.name}</div>
          <div className="text-sm text-gray-500">
            Stock: {line.stock.toFixed(2)} {line.product?.unit}
          </div>
          <div className="text-sm text-gray-500">
            Precio unitario: {line.price.toFixed(2)} EUR /{" "}
            {line.product?.unit === "G" ? "g" : "ud"}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
              Producto agregado
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
              Modo {line.inputMode === "AMOUNT" ? "Por importe" : "Por cantidad"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemoveProduct(line.productId)}
          className="rounded px-2 py-1 text-sm text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          Quitar
        </button>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500">Modo de entrada</label>
        <select
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white p-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
          value={line.inputMode}
          onChange={(event) =>
            onUpdateInputMode(
              line.productId,
              event.target.value as CartInputMode
            )
          }
        >
          <option value="AMOUNT">Por importe</option>
          <option value="QTY">Por cantidad</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          {line.inputMode === "QTY" ? (
            <>
              <label className="text-xs text-gray-500">Cantidad</label>

              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
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
                    )
                  }
                  className="h-11 w-11 rounded bg-gray-200 text-xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
                >
                  -
                </button>

                <input
                  ref={(node) => onCartValueInputRef(line.productId, node)}
                  className="h-11 w-full rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
                  type="number"
                  step={line.product?.unit === "UD" ? "1" : "0.001"}
                  min="0"
                  value={line.qtyInput}
                  onChange={(event) =>
                    onUpdateQty(line.productId, event.target.value)
                  }
                  onKeyDown={(event) =>
                    onCartValueKeyDown(line.productId, event)
                  }
                />

                <button
                  type="button"
                  onClick={() =>
                    onUpdateQty(
                      line.productId,
                      formatQtyInput(
                        line.qty + (line.product?.unit === "UD" ? 1 : 0.001),
                        line.product?.unit === "UD" ? "UD" : "G"
                      )
                    )
                  }
                  className="h-11 w-11 rounded-2xl bg-gray-900 text-xl font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
                >
                  +
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Importe final estimado: {line.finalAmount.toFixed(2)} EUR
              </div>
            </>
          ) : (
            <>
              <label className="text-xs text-gray-500">Importe en euros</label>
              <input
                ref={(node) => onCartValueInputRef(line.productId, node)}
                className="mt-1 h-11 w-full rounded-2xl border border-black/10 bg-white p-2 text-center text-lg font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
                type="number"
                step="0.01"
                min="0"
                value={line.amountInput}
                onChange={(event) =>
                  onUpdateAmount(line.productId, event.target.value)
                }
                onKeyDown={(event) =>
                  onCartValueKeyDown(line.productId, event)
                }
              />

              <div className="mt-2 text-xs text-gray-500">
                Cantidad calculada:{" "}
                {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500">Cantidad final</label>
            <div className="rounded-2xl border border-black/8 bg-gray-50 p-2">
              {formatQtyLabel(line.qty, line.product?.unit ?? "G")}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">
              Importe final estimado
            </label>
            <div className="rounded-2xl border border-black/8 bg-gray-50 p-2">
              {line.finalAmount.toFixed(2)} EUR
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Importe base estimado: {line.originalAmount.toFixed(2)} EUR
          </div>

          {line.discountAmount > 0 && (
            <div className="text-xs text-blue-700">
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
