// app/stock/history/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
    if (type === "TRANSFER") return "Reposicion";
    if (type === "INVENTORY_ADJUSTMENT") return "Conteo";
    return type;
  }

  function typeClass(type: string) {
    if (type === "IN") return "bg-green-100 text-green-700";
    if (type === "OUT") return "bg-red-100 text-red-700";
    if (type === "ADJUST") return "bg-blue-100 text-blue-700";
    if (type === "TRANSFER") return "bg-cyan-100 text-cyan-700";
    if (type === "INVENTORY_ADJUSTMENT") return "bg-amber-100 text-amber-700";
    return "bg-gray-100 text-gray-700";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial de stock</h1>
          <p className="text-sm text-gray-500">
            Auditoría de entradas, salidas, compras, retiradas y ajustes.
          </p>
        </div>

        <Link
          href="/stock"
          className="rounded bg-gray-900 px-4 py-2 font-bold text-white"
        >
          Volver a stock
        </Link>
      </div>

      <section className="mb-4 grid gap-2 rounded border p-4 md:grid-cols-4">
        <input
          className="rounded border p-3"
          placeholder="Buscar producto o motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="rounded border p-3"
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
          className="rounded border p-3"
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
          className="rounded border p-3 font-bold"
        >
          Limpiar filtros
        </button>
      </section>

      <section className="mb-4 grid gap-2 md:grid-cols-3">
        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Movimientos filtrados</div>
          <strong>{filteredMoves.length}</strong>
        </div>

        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Entradas</div>
          <strong className="text-green-700">
            {filteredMoves.filter((m) => m.type === "IN").length}
          </strong>
        </div>

        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Salidas</div>
          <strong className="text-red-700">
            {filteredMoves.filter((m) => m.type === "OUT").length}
          </strong>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-bold">Movimientos</h2>

        {filteredMoves.length === 0 && (
          <p className="text-sm text-gray-500">
            No hay movimientos con estos filtros.
          </p>
        )}

        <div className="space-y-2">
          {filteredMoves.map((move) => (
            <div key={move.id} className="rounded border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{move.product.name}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(move.createdAt).toLocaleString()}
                  </div>
                </div>

                <span
                  className={`rounded px-3 py-1 text-sm font-bold ${typeClass(
                    move.type
                  )}`}
                >
                  {typeLabel(move.type)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
                <div>
                  Cantidad:{" "}
                  <strong>
                    {Number(move.qty).toFixed(2)} {move.product.unit}
                  </strong>
                </div>

                <div>
                  Antes:{" "}
                  <strong>
                    {Number(move.previousStock).toFixed(2)} {move.product.unit}
                  </strong>
                </div>

                <div>
                  Después:{" "}
                  <strong>
                    {Number(move.newStock).toFixed(2)} {move.product.unit}
                  </strong>
                </div>

                <div>
                  Diferencia:{" "}
                  <strong
                    className={
                      Number(move.newStock) - Number(move.previousStock) >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {(Number(move.newStock) - Number(move.previousStock)).toFixed(
                      2
                    )}{" "}
                    {move.product.unit}
                  </strong>
                </div>
              </div>

              {move.note && (
                <div className="mt-2 rounded bg-gray-50 p-2 text-sm text-gray-600">
                  {move.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
