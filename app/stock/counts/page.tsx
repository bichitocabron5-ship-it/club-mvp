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
  { value: "AUDIT", label: "Auditoría" },
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
  if (status === "OPEN") {
    return "border border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "CONFIRMED") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "CANCELLED") {
    return "border border-black/10 bg-black/5 text-[#6d6860]";
  }

  return "border border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]";
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/stock"
          className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold sm:w-auto"
        >
          ← Volver a stock
        </Link>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b0b0c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#171719] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Recargando..." : "Actualizar datos"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
        <section className="app-panel overflow-hidden rounded-[2rem]">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Inventario físico
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Nuevo conteo
            </h2>

            <p className="mt-1 text-sm app-muted">
              Registra un conteo físico sin modificar el stock hasta su confirmación.
            </p>
          </div>

          <div className="p-5 sm:p-6">

          <form onSubmit={handleCreateCount} className="space-y-4">
            <label className="block text-sm font-bold text-[#201f1d]">
              Tipo de conteo
            </label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
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

            <label className="block text-sm font-bold text-[#201f1d]">
              Notas
            </label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
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
              <div className="space-y-4 overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-[#201f1d]">
                      Selección de productos
                    </h3>

                    <p className="mt-1 text-sm app-muted">
                      El conteo parcial solo incluye los productos marcados.
                    </p>
                  </div>

                  <span className="rounded-full border border-[#b4a78d]/30 bg-white/70 px-3 py-1 text-xs font-bold text-[#645b4c]">
                    {selectedProductIds.length} seleccionados
                  </span>
                </div>

                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
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
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-[1.25rem] border p-3.5 transition-all ${
                          checked
                            ? "border-[#a7282d]/25 bg-[#a7282d]/5"
                            : "border-black/8 bg-white/85 hover:border-[#b4a78d]/40"
                        }`}
                      >
                        <div>
                         <div className="font-black text-[#201f1d]">
                          {product.name}
                        </div>

                        <div className="mt-1 text-sm app-muted">
                            Sistema: {Number(product.stock).toFixed(2)} {product.unit}
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(product.id)}
                          className="h-5 w-5 accent-[#a7282d]"
                        />
                      </label>
                    );
                  })}

                  {filteredProducts.length === 0 && (
                    <EmptyState message="No hay productos activos para este filtro." />
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="app-button-primary w-full rounded-2xl p-3 font-bold disabled:opacity-40"
            >
              {submitting ? "Creando..." : "Crear conteo"}
            </button>
          </form>
          </div>
        </section>

        <section className="app-panel overflow-hidden rounded-[2rem]">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                    Trazabilidad
                  </span>
                </div>

                <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                  Conteos recientes
                </h2>

                <p className="mt-1 text-sm app-muted">
                  Histórico de conteos físicos y estado de revisión.
                </p>
              </div>

              <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
                {counts.length} registro{counts.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {counts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                <div className="font-black text-[#201f1d]">
                  Sin conteos registrados
                </div>

                <p className="mt-2 text-sm app-muted">
                  Los conteos de inventario aparecerán aquí cuando se creen.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {counts.map((count, index) => {
                  const hasDifferences = count.summary.differenceItems > 0;
                  const hasPending = count.summary.pendingItems > 0;

                  return (
                    <Link
                      key={count.id}
                      href={`/stock/counts/${count.id}`}
                      className="group block overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 outline-none transition-all hover:-translate-y-0.5 hover:border-[#a7282d]/20 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)] focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
                    >
                      <div className="p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                              {String(index + 1).padStart(2, "0")}
                            </span>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg font-black tracking-[-0.02em] text-[#201f1d]">
                                  Conteo #{count.id}
                                </h3>

                                <span className="rounded-full border border-[#b4a78d]/25 bg-[#f7f4ee] px-3 py-1 text-xs font-bold text-[#645b4c]">
                                  {countTypeLabel(count.type)}
                                </span>
                              </div>

                              <div className="mt-1 text-sm app-muted">
                                {new Date(count.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${countStatusClass(
                                count.status,
                              )}`}
                            >
                              {countStatusLabel(count.status)}
                            </span>

                            <span
                              aria-hidden="true"
                              className="text-lg font-black text-[#a7282d]/45 transition-transform group-hover:translate-x-1 group-hover:text-[#a7282d]"
                            >
                              →
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Líneas
                            </div>

                            <div className="mt-1 text-xl font-black text-[#201f1d]">
                              {count.summary.totalItems}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-emerald-50/70 px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/70">
                              Contadas
                            </div>

                            <div className="mt-1 text-xl font-black text-emerald-700">
                              {count.summary.countedItems}
                            </div>
                          </div>

                          <div
                            className={`rounded-2xl border px-3 py-3 ${
                              hasDifferences
                                ? "border-red-100 bg-red-50/70"
                                : "border-emerald-100 bg-emerald-50/70"
                            }`}
                          >
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Diferencias
                            </div>

                            <div
                              className={`mt-1 text-xl font-black ${
                                hasDifferences
                                  ? "text-red-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {count.summary.differenceItems}
                            </div>
                          </div>

                          <div
                            className={`rounded-2xl border px-3 py-3 ${
                              hasPending
                                ? "border-amber-200 bg-amber-50/70"
                                : "border-black/7 bg-white"
                            }`}
                          >
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Pendientes
                            </div>

                            <div
                              className={`mt-1 text-xl font-black ${
                                hasPending
                                  ? "text-amber-800"
                                  : "text-[#201f1d]"
                              }`}
                            >
                              {count.summary.pendingItems}
                            </div>
                          </div>
                        </div>

                        {count.notes ? (
                          <div className="mt-3 rounded-[1.25rem] border border-[#b4a78d]/20 bg-[#f7f4ee]/70 px-4 py-3">
                            <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                              Nota
                            </div>

                            <div className="mt-1 break-words text-sm leading-6 text-[#201f1d]">
                              {count.notes}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
