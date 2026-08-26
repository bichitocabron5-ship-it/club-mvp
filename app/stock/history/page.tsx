// app/stock/history/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Product = {
  id: number;
  name: string;
  unit: string;
};

type StockMove = {
  id: number;
  productId: number;
  type: "IN" | "OUT" | "ADJUST" | "TRANSFER" | string;
  qty: number;
  previousStock: number;
  newStock: number;
  note: string | null;
  createdAt: string;
  product: Product;
};

export default function StockHistoryPage() {
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [productFilter, setProductFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  async function loadMoves() {
    const res = await fetch("/api/stock/moves");
    const data: StockMove[] = await res.json();
    setMoves(data);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadMoves();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const products = useMemo(() => {
    const map = new Map<number, Product>();

    for (const move of moves) {
      map.set(move.product.id, move.product);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [moves]);

  const filteredMoves = useMemo(() => {
    const q = search.trim().toLowerCase();

    return moves.filter((move) => {
      const matchesProduct =
        productFilter === "ALL" || String(move.productId) === productFilter;

      const matchesType = typeFilter === "ALL" || move.type === typeFilter;

      const matchesSearch =
        !q ||
        move.product.name.toLowerCase().includes(q) ||
        String(move.note || "").toLowerCase().includes(q);

      return matchesProduct && matchesType && matchesSearch;
    });
  }, [moves, productFilter, typeFilter, search]);

  function typeLabel(type: string) {
    if (type === "IN") return "Entrada";
    if (type === "OUT") return "Salida";
    if (type === "ADJUST") return "Ajuste";
    if (type === "TRANSFER") return "Reposición";
    if (type === "INVENTORY_ADJUSTMENT") return "Conteo";
    return type;
  }

  function typeClass(type: string) {
    if (type === "IN") {
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (type === "OUT") {
      return "border border-red-200 bg-red-50 text-red-700";
    }

    if (type === "ADJUST") {
      return "border border-amber-200 bg-amber-50 text-amber-800";
    }

    if (type === "TRANSFER") {
      return "border border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]";
    }

    if (type === "INVENTORY_ADJUSTMENT") {
      return "border border-[#a7282d]/15 bg-[#a7282d]/8 text-[#861f23]";
    }

    return "border border-black/10 bg-black/5 text-[#6d6860]";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="Historial de stock"
          description="Auditoría de entradas, salidas, reposiciones, conteos y ajustes de inventario."
        />

        <Link
          href="/stock"
          className="app-button-secondary inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold"
        >
          ← Volver a stock
        </Link>
      </div>

      <section className="app-panel mb-5 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Filtros
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Buscar movimientos
          </h2>
        </div>

        <div className="grid gap-3 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
            placeholder="Buscar producto o motivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <option value="ALL">Todos los productos</option>

            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          <select
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Todos los tipos</option>
            <option value="IN">Entradas</option>
            <option value="OUT">Salidas</option>
            <option value="ADJUST">Ajustes</option>
            <option value="TRANSFER">Reposiciones</option>
            <option value="INVENTORY_ADJUSTMENT">Conteos</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setProductFilter("ALL");
              setTypeFilter("ALL");
            }}
            className="app-button-secondary rounded-xl px-4 py-3 font-bold"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="app-panel relative overflow-hidden rounded-[1.5rem] p-4">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-[#0b0b0c]" />

          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
            Movimientos filtrados
          </div>

          <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
            {filteredMoves.length}
          </div>
        </div>

        <div className="app-panel relative overflow-hidden rounded-[1.5rem] border-emerald-100 bg-emerald-50/60 p-4">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />

          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/70">
            Entradas
          </div>

          <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-emerald-700">
            {filteredMoves.filter((m) => m.type === "IN").length}
          </div>
        </div>

        <div className="app-panel relative overflow-hidden rounded-[1.5rem] border-red-100 bg-red-50/60 p-4">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-red-500" />

          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-red-700/70">
            Salidas
          </div>

          <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-red-700">
            {filteredMoves.filter((m) => m.type === "OUT").length}
          </div>
        </div>
      </section>

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Auditoría
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Movimientos
              </h2>

              <p className="mt-1 text-sm app-muted">
                Histórico detallado de cambios de inventario.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {filteredMoves.length} resultados
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filteredMoves.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
              <div className="font-black text-[#201f1d]">
                Sin movimientos
              </div>

              <p className="mt-2 text-sm app-muted">
                No hay movimientos que coincidan con los filtros actuales.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMoves.map((move, index) => {
                const previousStock = Number(move.previousStock);
                const newStock = Number(move.newStock);
                const difference = newStock - previousStock;

                return (
                  <article
                    key={move.id}
                    className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="min-w-0">
                            <div className="font-black text-[#201f1d]">
                              {move.product.name}
                            </div>

                            <div className="mt-1 text-xs app-muted">
                              {new Date(move.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${typeClass(
                            move.type,
                          )}`}
                        >
                          {typeLabel(move.type)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-[#f7f4ee] p-3">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Cantidad
                          </div>

                          <div className="mt-1 font-black text-[#201f1d]">
                            {Number(move.qty).toFixed(2)} {move.product.unit}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-black/7 bg-white p-3">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Antes
                          </div>

                          <div className="mt-1 font-black">
                            {previousStock.toFixed(2)} {move.product.unit}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-black/7 bg-white p-3">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Después
                          </div>

                          <div className="mt-1 font-black">
                            {newStock.toFixed(2)} {move.product.unit}
                          </div>
                        </div>

                        <div
                          className={`rounded-2xl border p-3 ${
                            difference > 0
                              ? "border-emerald-100 bg-emerald-50/70"
                              : difference < 0
                                ? "border-red-100 bg-red-50/70"
                                : "border-[#b4a78d]/25 bg-[#f7f4ee]"
                          }`}
                        >
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Variación
                          </div>

                          <div
                            className={`mt-1 font-black ${
                              difference > 0
                                ? "text-emerald-700"
                                : difference < 0
                                  ? "text-red-700"
                                  : "text-[#645b4c]"
                            }`}
                          >
                            {difference > 0 ? "+" : ""}
                            {difference.toFixed(2)} {move.product.unit}
                          </div>
                        </div>
                      </div>

                      {move.note ? (
                        <div className="mt-3 rounded-[1.25rem] border border-[#b4a78d]/20 bg-[#f7f4ee]/70 px-4 py-3">
                          <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                            Nota
                          </div>

                          <div className="mt-1 text-sm leading-6 text-[#201f1d]">
                            {move.note}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
