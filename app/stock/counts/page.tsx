"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type {
  InventoryCountListItem,
  InventoryCountType,
  ProductSummary,
} from "@/lib/types";

const COUNT_TYPE_OPTIONS: Array<{ value: InventoryCountType; label: string }> = [
  { value: "PARTIAL", label: "Parcial" },
  { value: "FULL", label: "Completo" },
  { value: "CLOSING", label: "Cierre" },
  { value: "AUDIT", label: "Auditoria" },
];

function countTypeLabel(type: string) {
  return COUNT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function countStatusLabel(status: string) {
  if (status === "OPEN") return "Abierto";
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

function countStatusClass(status: string) {
  if (status === "OPEN") return "bg-amber-100 text-amber-700";
  if (status === "CONFIRMED") return "bg-green-100 text-green-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export default function InventoryCountsPage() {
  const [counts, setCounts] = useState<InventoryCountListItem[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const deferredProductSearch = useDeferredValue(productSearch);
  const [form, setForm] = useState({
    type: "PARTIAL" as InventoryCountType,
    notes: "",
  });
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  async function loadData() {
    setLoading(true);

    try {
      const [countsData, productsData] = await Promise.all([
        fetchJson<InventoryCountListItem[]>("/api/inventory-counts"),
        fetchJson<ProductSummary[]>("/api/products"),
      ]);

      setCounts(countsData);
      setProducts(productsData.filter((product) => product.active));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando conteos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const filteredProducts = useMemo(() => {
    const query = deferredProductSearch.trim().toLowerCase();

    return products.filter((product) => {
      if (!query) {
        return true;
      }

      return (
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    });
  }, [deferredProductSearch, products]);

  function toggleProduct(productId: number) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  async function handleCreateCount(e: React.FormEvent) {
    e.preventDefault();

    setSubmitting(true);

    try {
      const created = await fetchJson<InventoryCountListItem>("/api/inventory-counts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: form.type,
          notes: form.notes,
          productIds: form.type === "PARTIAL" ? selectedProductIds : undefined,
        }),
      });

      window.location.href = `/stock/counts/${created.id}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creando conteo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Conteos de inventario"
        description="Registra conteos fisicos sin tocar stock hasta la confirmacion final."
      />

      {error && <EmptyState message={error} className="mb-4" />}

      <div className="mb-4 flex flex-wrap gap-3">
        <Link
          href="/stock"
          className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 font-semibold"
        >
          Volver a stock
        </Link>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex rounded-full bg-gray-900 px-4 py-2 font-semibold text-white"
        >
          {loading ? "Recargando..." : "Recargar"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Nuevo conteo</h2>

          <form onSubmit={handleCreateCount} className="space-y-3">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
              value={form.type}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  type: e.target.value as InventoryCountType,
                }))
              }
            >
              {COUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <textarea
              className="min-h-28 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
              placeholder="Notas del conteo"
              value={form.notes}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  notes: e.target.value,
                }))
              }
            />

            {form.type === "PARTIAL" && (
              <div className="space-y-3 rounded-3xl border border-black/8 bg-white/60 p-3">
                <div>
                  <h3 className="font-semibold">Seleccion de productos</h3>
                  <p className="text-sm text-gray-500">
                    El conteo parcial solo incluye los productos marcados.
                  </p>
                </div>

                <input
                  className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                  placeholder="Buscar producto..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />

                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {filteredProducts.map((product) => {
                    const checked = selectedProductIds.includes(product.id);

                    return (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/80 p-3"
                      >
                        <div>
                          <div className="font-semibold">{product.name}</div>
                          <div className="text-sm text-gray-500">
                            Sistema: {Number(product.stock).toFixed(2)} {product.unit}
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(product.id)}
                          className="h-5 w-5"
                        />
                      </label>
                    );
                  })}

                  {filteredProducts.length === 0 && (
                    <EmptyState message="No hay productos activos para este filtro." />
                  )}
                </div>

                <div className="text-sm text-gray-500">
                  Seleccionados: <strong>{selectedProductIds.length}</strong>
                </div>
              </div>
            )}

            <button
              disabled={submitting}
              className="app-button-primary w-full rounded-2xl p-3 font-bold disabled:opacity-40"
            >
              {submitting ? "Creando..." : "Crear conteo"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <div className="app-panel rounded-3xl p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Conteos recientes</h2>
              <span className="text-sm text-gray-500">{counts.length} registros</span>
            </div>

            {counts.length === 0 && (
              <EmptyState message="Todavia no hay conteos registrados." />
            )}

            <div className="space-y-3">
              {counts.map((count) => (
                <Link
                  key={count.id}
                  href={`/stock/counts/${count.id}`}
                  className="block rounded-3xl border border-black/8 bg-white/72 p-4 transition hover:border-black/16 hover:bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">Conteo #{count.id}</div>
                      <div className="text-sm text-gray-500">
                        {countTypeLabel(count.type)} · {new Date(count.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${countStatusClass(count.status)}`}
                    >
                      {countStatusLabel(count.status)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
                    <div>
                      Lineas: <strong>{count.summary.totalItems}</strong>
                    </div>
                    <div>
                      Contadas: <strong>{count.summary.countedItems}</strong>
                    </div>
                    <div>
                      Diferencias: <strong>{count.summary.differenceItems}</strong>
                    </div>
                    <div>
                      Pendientes: <strong>{count.summary.pendingItems}</strong>
                    </div>
                  </div>

                  {count.notes && (
                    <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
                      {count.notes}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
