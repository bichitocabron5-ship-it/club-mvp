"use client";

import type {
  CatalogProductSummary,
  ProductCategory,
  ProductHashType,
} from "@/lib/types";
import { PRODUCT_CATEGORIES, PRODUCT_HASH_TYPES } from "@/lib/types";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const categoryLabelMap = new Map(
  PRODUCT_CATEGORIES.map((category) => [category.value, category.label])
);

const hashTypeLabelMap = new Map(
  PRODUCT_HASH_TYPES.map((hashType) => [hashType.value, hashType.label])
);

export function CatalogBrowser() {
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProductSummary[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | ProductCategory>("ALL");
  const [hashType, setHashType] = useState<"ALL" | ProductHashType>("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);

      try {
        const response = await fetch("/api/catalog/products", {
          cache: "no-store",
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (response.status === 401) {
            startTransition(() => {
              router.refresh();
            });
            return;
          }
          throw new Error(data?.error || "No se pudo cargar el catalogo");
        }

        const data = (await response.json()) as CatalogProductSummary[];

        if (active) {
          setProducts(data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el catalogo"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch("/api/catalog/session", {
        method: "DELETE",
      });
    } finally {
      startTransition(() => {
        router.refresh();
      });
      setLoggingOut(false);
    }
  }

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
      product.name,
      product.description ?? "",
      product.category,
      product.hashType ?? "",
      categoryLabelMap.get(product.category) ?? "",
      product.hashType ? hashTypeLabelMap.get(product.hashType) ?? "" : "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredQuery);
  });

  return (
    <main className="mx-auto w-full max-w-[110rem] px-4 py-4 md:px-6 md:py-6">
      <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(239,245,230,0.88))] p-5 shadow-[0_24px_60px_rgba(37,44,34,0.12)] md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full border border-[#31584d]/10 bg-white/75 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#31584d]">
              Modo kiosko
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#1b2119] md:text-5xl">
              Catalogo visual
            </h1>
            <p className="mt-3 text-sm text-[#566257] md:text-base">
              Consulta rapida en tablet. Solo lectura y sin acceso al resto del sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-full border border-black/10 bg-white/85 px-5 py-3 text-sm font-bold text-[#233d34] shadow-sm"
            disabled={loggingOut}
          >
            {loggingOut ? "Saliendo..." : "Salir kiosko"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            className="rounded-[1.2rem] border border-black/10 bg-white/88 px-5 py-4 text-base outline-none focus:border-[#31584d] focus:ring-4 focus:ring-[#a7c957]/25"
            placeholder="Buscar producto, categoria o hash"
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
            <option value="ALL">Todas las categorias</option>
            {PRODUCT_CATEGORIES.map((item) => (
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
            <option value="ALL">Todos los hash</option>
            {PRODUCT_HASH_TYPES.map((item) => (
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
              className="h-[22rem] animate-pulse rounded-[2rem] border border-black/6 bg-white/60"
            />
          ))}
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-[2rem] border border-black/8 bg-white/88 shadow-[0_20px_48px_rgba(37,44,34,0.1)]"
            >
              <div className="relative h-56 bg-[linear-gradient(135deg,#dce8cf,#f6f3ea)]">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.24em] text-[#607261]">
                        Sin foto
                      </div>
                      <div className="mt-2 text-lg font-bold text-[#314337]">
                        {categoryLabelMap.get(product.category) ?? product.category}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-black leading-tight text-[#1c211c]">
                      {product.name}
                    </div>
                    {product.description ? (
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[#536253]">
                        {product.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#eef4e4] px-3 py-1 text-xs font-bold text-[#31584d]">
                        {categoryLabelMap.get(product.category) ?? product.category}
                      </span>
                      {product.hashType ? (
                        <span className="rounded-full bg-[#f2ece3] px-3 py-1 text-xs font-bold text-[#7a5530]">
                          {hashTypeLabelMap.get(product.hashType) ?? product.hashType}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-3xl font-black text-[#1f4036]">
                      {product.price.toFixed(2)} EUR
                    </div>
                    <div className="text-sm text-[#5d6758]">
                      por {product.unit === "G" ? "gramo" : "unidad"}
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.2rem] bg-[#f7f4ed] px-4 py-3 text-sm font-semibold text-[#4f5d52]">
                  Solo lectura. Consulta protegida por clave de catalogo.
                </div>
              </div>
            </article>
          ))}

          {!filteredProducts.length && (
            <div className="rounded-[2rem] border border-dashed border-black/10 bg-white/70 px-6 py-10 text-center text-[#5c675d] md:col-span-2 2xl:col-span-3">
              No hay productos que coincidan con los filtros.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
