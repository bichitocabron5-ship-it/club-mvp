"use client";

import {
  getCatalogSectionMeta,
  getProductCategoryLabel,
  getProductHashTypeLabel,
} from "@/lib/types";
import type {
  CatalogProductSummary,
  ProductCategory,
  ProductHashType,
} from "@/lib/types";
import { useDeferredValue, useState } from "react";

type ProductMenuProps = {
  badge: string;
  title: string;
  description: string;
  products: CatalogProductSummary[];
  loading?: boolean;
  error?: string;
  note?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  logoutLabel?: string;
  loggingOut?: boolean;
  getProductImageUrl?: ((productId: number) => Promise<string | null>) | null;
  onLogout?: (() => void | Promise<void>) | null;
};

type ProductImageState = {
  url: string | null;
  loading: boolean;
  error: string;
};

function formatPrice(product: CatalogProductSummary) {
  return `${Number(product.price).toFixed(2)} EUR/${
    product.unit === "G" ? "g" : "ud"
  }`;
}

export function ProductMenu({
  badge,
  title,
  description,
  products,
  loading = false,
  error = "",
  note = "Solo lectura. Sin stock ni datos internos.",
  searchPlaceholder = "Buscar por referencia, nombre, categoría o subtipo",
  emptyMessage = "No hay productos que coincidan con los filtros.",
  logoutLabel = "Salir del catálogo",
  loggingOut = false,
  getProductImageUrl = null,
  onLogout = null,
}: ProductMenuProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [hashType, setHashType] = useState<"ALL" | ProductHashType>("ALL");
  const [productImages, setProductImages] = useState<
    Record<number, ProductImageState>
  >({});
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  async function loadProductImage(productId: number) {
    if (!getProductImageUrl) {
      return;
    }

    const current = productImages[productId];

    if (current?.loading || current?.url) {
      return;
    }

    setProductImages((previous) => ({
      ...previous,
      [productId]: {
        url: null,
        loading: true,
        error: "",
      },
    }));

    try {
      const url = await getProductImageUrl(productId);

      setProductImages((previous) => ({
        ...previous,
        [productId]: {
          url,
          loading: false,
          error: url ? "" : "Imagen no disponible",
        },
      }));
    } catch (error) {
      setProductImages((previous) => ({
        ...previous,
        [productId]: {
          url: null,
          loading: false,
          error:
            error instanceof Error ? error.message : "Imagen no disponible",
        },
      }));
    }
  }

  const seenCategories = new Set<ProductCategory>();
  const categoryOptions = products
    .filter((product) => {
      if (seenCategories.has(product.category)) {
        return false;
      }

      seenCategories.add(product.category);
      return true;
    })
    .sort((left, right) => {
      const leftSection = getCatalogSectionMeta(left.category);
      const rightSection = getCatalogSectionMeta(right.category);

      if (leftSection.order !== rightSection.order) {
        return leftSection.order - rightSection.order;
      }

      return getProductCategoryLabel(left.category).localeCompare(
        getProductCategoryLabel(right.category),
        "es"
      );
    })
    .map((product) => ({
      value: product.category,
      label: getProductCategoryLabel(product.category),
    }));

  const presentHashTypes = new Set<ProductHashType>();
  for (const product of products) {
    if (product.hashType) {
      presentHashTypes.add(product.hashType);
    }
  }

  const hashTypeOptions = Array.from(presentHashTypes)
    .sort((left, right) =>
      getProductHashTypeLabel(left).localeCompare(
        getProductHashTypeLabel(right),
        "es"
      )
    )
    .map((value) => ({
      value,
      label: getProductHashTypeLabel(value),
    }));

  const filteredProducts = products.filter((product) => {
    if (category !== "ALL" && product.category !== category) {
      return false;
    }

    if (hashType !== "ALL" && product.hashType !== hashType) {
      return false;
    }

    if (!deferredQuery) {
      return true;
    }

    const haystack = [
      product.sku ?? "",
      product.name,
      product.description ?? "",
      product.category,
      getProductCategoryLabel(product.category),
      product.hashType ?? "",
      product.hashType ? getProductHashTypeLabel(product.hashType) : "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredQuery);
  });

  const groups = new Map<
    string,
    {
      key: string;
      order: number;
      title: string;
      products: CatalogProductSummary[];
    }
  >();

  for (const product of filteredProducts) {
    const section = getCatalogSectionMeta(product.category);
    const existing = groups.get(section.key);

    if (existing) {
      existing.products.push(product);
      continue;
    }

    groups.set(section.key, {
      key: section.key,
      order: section.order,
      title: section.title,
      products: [product],
    });
  }

  const groupedProducts = Array.from(groups.values())
    .sort((left, right) => left.order - right.order)
    .map((group) => ({
      ...group,
      products: [...group.products].sort((left, right) =>
        left.name.localeCompare(right.name, "es")
      ),
    }));

  return (
    <main className="mx-auto w-full max-w-[110rem] px-4 py-4 md:px-6 md:py-6">
      <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,245,230,0.9))] p-5 shadow-[0_24px_60px_rgba(37,44,34,0.12)] md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full border border-[#31584d]/10 bg-white/75 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#31584d]">
              {badge}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#1b2119] md:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-sm text-[#566257] md:text-base">
              {description}
            </p>
          </div>

          {onLogout ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-full border border-black/10 bg-white/85 px-5 py-3 text-sm font-bold text-[#233d34] shadow-sm"
              disabled={loggingOut}
            >
              {loggingOut ? "Saliendo..." : logoutLabel}
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            className="rounded-[1.2rem] border border-black/10 bg-white/88 px-5 py-4 text-base outline-none focus:border-[#31584d] focus:ring-4 focus:ring-[#a7c957]/25"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            className="rounded-[1.2rem] border border-black/10 bg-white/88 px-5 py-4 text-base outline-none"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as "ALL" | ProductCategory)
            }
          >
            <option value="ALL">Todas las categorías</option>
            {categoryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            className="rounded-[1.2rem] border border-black/10 bg-white/88 px-5 py-4 text-base outline-none"
            value={hashType}
            onChange={(event) =>
              setHashType(event.target.value as "ALL" | ProductHashType)
            }
          >
            <option value="ALL">Todos los subtipos</option>
            {hashTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[24rem] animate-pulse rounded-[2rem] border border-black/6 bg-white/60"
            />
          ))}
        </div>
      ) : groupedProducts.length ? (
        <div className="grid gap-8">
          {groupedProducts.map((group) => (
            <section key={group.key} className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-[#1f241d]">
                    {group.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#5c675d]">
                    {group.products.length} producto
                    {group.products.length === 1 ? "" : "s"} visible
                    {group.products.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {group.products.map((product) => {
                  const imageState = productImages[product.id];
                  const visibleImageUrl = imageState?.url ?? product.thumbnailUrl;
                  const canLoadFullImage =
                    product.hasImage && Boolean(getProductImageUrl);
                  const showLoadImageButton = canLoadFullImage && !imageState?.url;

                  return (
                    <article
                      key={product.id}
                      className="overflow-hidden rounded-[2rem] border border-black/8 bg-white/88 shadow-[0_20px_48px_rgba(37,44,34,0.1)]"
                    >
                      <div className="relative h-64 overflow-hidden bg-[linear-gradient(135deg,#dce8cf,#f6f3ea)]">
                        {visibleImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={visibleImageUrl}
                              alt={product.name}
                              loading="lazy"
                              decoding="async"
                              width={400}
                              height={256}
                              className="h-full w-full object-cover"
                            />
                            {showLoadImageButton ? (
                              <button
                                type="button"
                                onClick={() => void loadProductImage(product.id)}
                                disabled={imageState?.loading}
                                className="absolute bottom-4 right-4 rounded-full bg-[#31584d] px-4 py-2 text-sm font-bold text-white shadow-lg disabled:opacity-60"
                              >
                                {imageState?.loading ? "Cargando..." : "Ver foto"}
                              </button>
                            ) : null}
                            {imageState?.error ? (
                              <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-full bg-white/92 px-3 py-2 text-xs font-semibold text-red-700 shadow">
                                {imageState.error}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center px-6 text-center">
                            <div>
                              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#607261]">
                                {product.hasImage ? "Foto disponible" : "Sin foto"}
                              </div>
                              <div className="mt-2 text-lg font-bold text-[#314337]">
                                {getProductCategoryLabel(product.category)}
                              </div>
                              {canLoadFullImage ? (
                                <button
                                  type="button"
                                  onClick={() => void loadProductImage(product.id)}
                                  disabled={imageState?.loading}
                                  className="mt-4 rounded-full bg-[#31584d] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                                >
                                  {imageState?.loading
                                    ? "Cargando..."
                                    : "Ver foto"}
                                </button>
                              ) : null}
                              {imageState?.error ? (
                                <div className="mt-3 text-xs font-semibold text-red-700">
                                  {imageState.error}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>

                    <div className="grid gap-4 p-5 md:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-2xl font-black leading-tight text-[#1c211c]">
                            {product.name}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {product.sku ? (
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#627166] ring-1 ring-black/8">
                                Ref. {product.sku}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-[#eef4e4] px-3 py-1 text-xs font-bold text-[#31584d]">
                              {getProductCategoryLabel(product.category)}
                            </span>
                            {product.hashType ? (
                              <span className="rounded-full bg-[#f2ece3] px-3 py-1 text-xs font-bold text-[#7a5530]">
                                {getProductHashTypeLabel(product.hashType)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-3xl font-black text-[#1f4036]">
                            {formatPrice(product)}
                          </div>
                        </div>
                      </div>

                      {product.description ? (
                        <p className="min-h-12 text-sm leading-6 text-[#536253]">
                          {product.description}
                        </p>
                      ) : (
                        <p className="min-h-12 text-sm leading-6 text-[#7c877e]">
                          Selección disponible sin descripción adicional.
                        </p>
                      )}

                      <div className="rounded-[1.2rem] bg-[#f7f4ed] px-4 py-3 text-sm font-semibold text-[#4f5d52]">
                        {note}
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[2rem] border border-dashed border-black/10 bg-white/70 px-6 py-10 text-center text-[#5c675d]">
          {emptyMessage}
        </div>
      )}
    </main>
  );
}
