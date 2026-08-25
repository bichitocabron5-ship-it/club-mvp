"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import type { AddProductOptions } from "@/lib/helpers/sales-cart";
import {
  getSalesCategoryLabel,
  getSalesHashTypeLabel,
  SALES_PRODUCT_CATEGORIES,
} from "@/lib/helpers/sales-formatters";
import { PRODUCT_HASH_TYPES } from "@/lib/types";
import type { ProductHashType, ProductSummary } from "@/lib/types";

function normalizeProductSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasReasonableProductSearchMatch(
  product: ProductSummary,
  query: string
) {
  if (query.length < 2) return false;

  return (
    normalizeProductSearchValue(product.sku).includes(query) ||
    normalizeProductSearchValue(product.name).includes(query)
  );
}

export function useSalesProducts({
  products,
  onAddProduct,
}: {
  products: ProductSummary[];
  onAddProduct: (
    product: ProductSummary,
    options?: AddProductOptions
  ) => boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedHashType, setSelectedHashType] = useState<
    "ALL" | ProductHashType
  >("ALL");

  const availableHashTypes = useMemo(() => {
    const present = new Set(
      products
        .filter((product) => product.active && product.category === "HASH")
        .map((product) => product.hashType)
        .filter((hashType): hashType is ProductHashType => Boolean(hashType))
    );

    return PRODUCT_HASH_TYPES.filter((hashType) => present.has(hashType.value));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => product.active)
      .filter((product) => {
        if (selectedCategory === "ALL") return true;
        return product.category === selectedCategory;
      })
      .filter((product) => {
        if (selectedHashType === "ALL") return true;
        return product.hashType === selectedHashType;
      })
      .filter((product) => {
        if (!query) return true;
        const categoryLabel = getSalesCategoryLabel(product.category);
        const hashTypeLabel = product.hashType
          ? getSalesHashTypeLabel(product.hashType)
          : "";
        const haystack = [
          product.sku ?? "",
          product.name,
          product.category,
          categoryLabel,
          product.hashType ?? "",
          hashTypeLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((left, right) => {
        if (!query) return 0;

        const leftExactSku = (left.sku ?? "").toLowerCase() === query;
        const rightExactSku = (right.sku ?? "").toLowerCase() === query;

        if (leftExactSku === rightExactSku) return 0;
        return leftExactSku ? -1 : 1;
      });
  }, [products, search, selectedCategory, selectedHashType]);

  function handleCategoryFilter(category: string) {
    setSelectedCategory(category);

    if (category !== "ALL" && category !== "HASH") {
      setSelectedHashType("ALL");
    }
  }

  function handleHashTypeFilter(hashType: ProductHashType | "ALL") {
    if (
      hashType !== "ALL" &&
      selectedCategory !== "ALL" &&
      selectedCategory !== "HASH"
    ) {
      setSelectedCategory("HASH");
    }

    setSelectedHashType(hashType);
  }

  function handleProductSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.code !== "NumpadEnter") return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();

    const query = normalizeProductSearchValue(event.currentTarget.value);
    if (!query) return;

    const exactSkuMatches = products.filter(
      (product) =>
        product.active && normalizeProductSearchValue(product.sku) === query
    );

    if (exactSkuMatches.length > 0) {
      if (
        exactSkuMatches.length === 1 &&
        Number(exactSkuMatches[0].stock) > 0 &&
        onAddProduct(exactSkuMatches[0], { focusInput: true })
      ) {
        setSearch("");
      }

      return;
    }

    const visibleDirectMatches = filteredProducts.filter((product) => {
      return (
        Number(product.stock) > 0 &&
        hasReasonableProductSearchMatch(product, query)
      );
    });

    if (
      visibleDirectMatches.length === 1 &&
      onAddProduct(visibleDirectMatches[0], { focusInput: true })
    ) {
      setSearch("");
    }
  }

  function resetProductFilters() {
    setSearch("");
    setSelectedCategory("ALL");
    setSelectedHashType("ALL");
  }

  return {
    availableHashTypes,
    filteredProducts,
    productCategories: SALES_PRODUCT_CATEGORIES,
    search,
    selectedCategory,
    selectedHashType,
    handleCategoryFilter,
    handleHashTypeFilter,
    handleProductSearchKeyDown,
    resetProductFilters,
    setSearch,
  };
}
