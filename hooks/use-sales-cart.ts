"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  buildSalesCartLines,
  findClosestGramQty,
  getPricingEstimate,
} from "@/lib/helpers/sales-cart";
import type {
  AddProductOptions,
  CartInputMode,
  CartItem,
} from "@/lib/helpers/sales-cart";
import {
  formatQtyInput,
  normalizeDiscountPercent,
  parsePositiveNumber,
  roundCurrency,
} from "@/lib/helpers/sales-formatters";
import type { ProductSummary } from "@/lib/types";

type UseSalesCartOptions = {
  products: ProductSummary[];
  discountPercent: number;
  focusRegisterButton: () => void;
};

export function useSalesCart({
  products,
  discountPercent,
  focusRegisterButton,
}: UseSalesCartOptions) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [focusedCartProductId, setFocusedCartProductId] = useState<
    number | null
  >(null);
  const cartInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const normalizedDiscountPercent = normalizeDiscountPercent(discountPercent);
  const cartLines = useMemo(
    () =>
      buildSalesCartLines({
        cart,
        products,
        discountPercent: normalizedDiscountPercent,
      }),
    [cart, normalizedDiscountPercent, products]
  );

  useEffect(() => {
    if (focusedCartProductId === null) return;

    const input = cartInputRefs.current.get(focusedCartProductId);
    if (!input) return;

    input.focus();
    input.select();
    setFocusedCartProductId(null);
  }, [cart, focusedCartProductId]);

  function setCartValueInputRef(
    productId: number,
    node: HTMLInputElement | null
  ) {
    if (node) {
      cartInputRefs.current.set(productId, node);
      return;
    }

    cartInputRefs.current.delete(productId);
  }

  function addProduct(
    product: ProductSummary,
    options: AddProductOptions = {}
  ) {
    if (Number(product.stock) <= 0) return false;

    if (options.focusInput) {
      setFocusedCartProductId(product.id);
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) => {
          if (item.productId !== product.id) return item;

          if (item.inputMode === "QTY") {
            return {
              ...item,
              qtyInput: formatQtyInput(
                (parsePositiveNumber(existing.qtyInput) ?? 0) + 1,
                product.unit
              ),
            };
          }

          const currentAmount = parsePositiveNumber(item.amountInput) ?? 0;
          const addedAmount = getPricingEstimate(
            1,
            Number(product.price),
            normalizedDiscountPercent
          ).finalAmount;

          return {
            ...item,
            amountInput: roundCurrency(currentAmount + addedAmount).toFixed(2),
          };
        });
      }

      return [
        ...prev,
        {
          productId: product.id,
          inputMode: "AMOUNT",
          qtyInput: "1",
          amountInput: "",
        },
      ];
    });

    return true;
  }

  function updateQty(productId: number, value: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, qtyInput: value } : item
      )
    );
  }

  function updateAmount(productId: number, value: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, amountInput: value } : item
      )
    );
  }

  function updateInputMode(productId: number, inputMode: CartInputMode) {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;

    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        if (inputMode === "QTY") {
          const parsedAmount = parsePositiveNumber(item.amountInput);
          let nextQtyInput = item.qtyInput;

          if (
            parsedAmount !== null &&
            Number(product.price) > 0 &&
            normalizedDiscountPercent < 100
          ) {
            const effectivePrice =
              Number(product.price) * (1 - normalizedDiscountPercent / 100);
            const nextQty =
              product.unit === "UD"
                ? Math.round(parsedAmount / effectivePrice)
                : findClosestGramQty(
                    parsedAmount / effectivePrice,
                    Number(product.price),
                    normalizedDiscountPercent,
                    parsedAmount
                  );

            if (nextQty > 0) {
              nextQtyInput = formatQtyInput(nextQty, product.unit);
            }
          }

          return {
            ...item,
            inputMode,
            qtyInput: nextQtyInput,
          };
        }

        const parsedQty = parsePositiveNumber(item.qtyInput);
        return {
          ...item,
          inputMode,
          amountInput:
            item.amountInput ||
            (parsedQty !== null
              ? getPricingEstimate(
                  parsedQty,
                  Number(product.price),
                  normalizedDiscountPercent
                ).finalAmount.toFixed(2)
              : ""),
        };
      })
    );
  }

  function removeProduct(productId: number) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  function clearCart() {
    setCart([]);
  }

  function focusCartInput(productId: number) {
    const input = cartInputRefs.current.get(productId);
    if (!input) return false;

    input.focus();
    input.select();
    return true;
  }

  function handleCartValueKeyDown(
    productId: number,
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key !== "Enter" && event.code !== "NumpadEnter") return;

    event.preventDefault();

    const currentIndex = cartLines.findIndex(
      (line) => line.productId === productId
    );
    const nextLine = currentIndex >= 0 ? cartLines[currentIndex + 1] : null;

    if (nextLine && focusCartInput(nextLine.productId)) {
      return;
    }

    focusRegisterButton();
  }

  return {
    cart,
    cartLines,
    addProduct,
    clearCart,
    handleCartValueKeyDown,
    removeProduct,
    setCartValueInputRef,
    updateAmount,
    updateInputMode,
    updateQty,
  };
}
