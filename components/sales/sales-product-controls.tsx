import type { KeyboardEvent, RefObject } from "react";

import type { ProductHashType } from "@/lib/types";

type SalesProductCategoryOption = {
  value: string;
  label: string;
};

type SalesHashTypeOption = {
  value: ProductHashType;
  label: string;
};

export function SalesProductControls({
  availableHashTypes,
  categories,
  productSearchRef,
  search,
  selectedCategory,
  selectedHashType,
  onCategoryFilter,
  onHashTypeFilter,
  onProductSearchKeyDown,
  onSearchChange,
}: {
  availableHashTypes: SalesHashTypeOption[];
  categories: readonly SalesProductCategoryOption[];
  productSearchRef: RefObject<HTMLInputElement | null>;
  search: string;
  selectedCategory: string;
  selectedHashType: "ALL" | ProductHashType;
  onCategoryFilter: (category: string) => void;
  onHashTypeFilter: (hashType: ProductHashType | "ALL") => void;
  onProductSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <>
      <div className="app-panel rounded-3xl p-4">
        <label className="mb-1 block text-sm font-medium">
          Buscar producto
        </label>
        <input
          className="w-full rounded-2xl border border-black/10 bg-white/80 p-3 text-base"
          placeholder="Buscar por código o nombre..."
          ref={productSearchRef}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={onProductSearchKeyDown}
          autoComplete="off"
        />
      </div>

      <div className="app-panel rounded-3xl p-4">
        <div className="mb-2 text-sm font-medium">Categorías rápidas</div>

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => onCategoryFilter(category.value)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                selectedCategory === category.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {availableHashTypes.length > 0 ? (
        <div className="app-panel rounded-3xl p-4">
          <div className="mb-2 text-sm font-medium">Subtipos Hash</div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onHashTypeFilter("ALL")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                selectedHashType === "ALL"
                  ? "bg-blue-700 text-white"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              Todos
            </button>

            {availableHashTypes.map((hashType) => (
              <button
                key={hashType.value}
                type="button"
                onClick={() => onHashTypeFilter(hashType.value)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  selectedHashType === hashType.value
                    ? "bg-blue-700 text-white"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {hashType.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
