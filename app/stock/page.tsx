// app/stock/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  unit: "G" | "UD" | string;
  price: number;
  stock: number;
};

type StockMove = {
  id: number;
  productId: number;
  type: "IN" | "OUT" | "ADJUST" | string;
  qty: number;
  previousStock: number;
  newStock: number;
  note: string | null;
  createdAt: string;
  product: Product;
};

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustType, setAdjustType] = useState<"ADD" | "REMOVE">("REMOVE");

  const [form, setForm] = useState({
    productId: "",
    type: "IN",
    qty: "",
    note: "",
  });

  async function loadData() {
    const [productsRes, movesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/stock/moves"),
    ]);

    const productsData: Product[] = await productsRes.json();
    const movesData: StockMove[] = await movesRes.json();

    setProducts(productsData);
    setMoves(movesData);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === Number(form.productId));
  }, [products, form.productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    const res = await fetch("/api/stock/move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: Number(form.productId),
        type: form.type,
        qty: Number(form.qty),
        note: form.note,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error registrando movimiento");
      return;
    }

    setForm({
      productId: "",
      type: "IN",
      qty: "",
      note: "",
    });

    await loadData();
  }

  function typeLabel(type: string) {
    if (type === "IN") return "Entrada";
    if (type === "OUT") return "Salida";
    if (type === "ADJUST") return "Ajuste";
    return type;
  }

  function typeClass(type: string) {
    if (type === "IN") return "bg-green-100 text-green-700";
    if (type === "OUT") return "bg-red-100 text-red-700";
    if (type === "ADJUST") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  }

  async function adjustStock() {
    if (!selectedProduct) {
      alert("Selecciona producto");
      return;
    }

    const qty = Number(adjustQty);

    if (!qty || qty <= 0) {
      alert("Cantidad inválida");
      return;
    }

    if (adjustReason.trim().length < 3) {
      alert("Indica motivo");
      return;
    }

    const res = await fetch("/api/stock/adjust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: selectedProduct,
        qty,
        type: adjustType,
        reason: adjustReason,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error ajustando stock");
      return;
    }

    setAdjustQty("");
    setAdjustReason("");

    await loadData();
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="text-sm text-gray-500">
          Entradas, salidas, ajustes e historial de movimientos.
        </p>
      </div>

      <a
        href="/stock/history"
        className="mb-4 inline-block rounded bg-gray-900 px-4 py-2 text-white"
      >
        Ver historial de stock
      </a>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <section className="space-y-4">
          <div className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">Nuevo movimiento</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <select
                className="w-full rounded border p-3"
                value={form.productId}
                onChange={(e) =>
                  setForm({ ...form, productId: e.target.value })
                }
                required
              >
                <option value="">Selecciona producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · stock {Number(p.stock).toFixed(2)} {p.unit}
                  </option>
                ))}
              </select>

              {selectedProduct && (
                <div className="rounded bg-gray-50 p-3 text-sm">
                  Stock actual:{" "}
                  <strong>
                    {Number(selectedProduct.stock).toFixed(2)}{" "}
                    {selectedProduct.unit}
                  </strong>
                </div>
              )}

              <select
                className="w-full rounded border p-3"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="IN">Entrada</option>
                <option value="OUT">Salida</option>
                <option value="ADJUST">Ajuste / cuadre</option>
              </select>

              <input
                className="w-full rounded border p-3"
                type="number"
                step={selectedProduct?.unit === "UD" ? "1" : "0.01"}
                min="0"
                placeholder={
                  form.type === "ADJUST"
                    ? "Nuevo stock final"
                    : "Cantidad del movimiento"
                }
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
              />

              <input
                className="w-full rounded border p-3"
                placeholder="Nota / motivo"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />

              <button
                disabled={loading}
                className="w-full rounded bg-blue-600 p-3 font-bold text-white disabled:opacity-40"
              >
                {loading ? "Guardando..." : "Registrar movimiento"}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded border p-4">
            <h3 className="mb-3 font-bold">Ajuste manual</h3>

            <div className="grid gap-2">
              <select
                className="rounded border p-2"
                value={adjustType}
                onChange={(e) =>
                  setAdjustType(e.target.value as "ADD" | "REMOVE")
                }
              >
                <option value="REMOVE">Salida / Merma</option>
                <option value="ADD">Entrada / Corrección</option>
              </select>

              <input
                className="rounded border p-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Cantidad"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
              />

              <input
                className="rounded border p-2"
                placeholder="Motivo obligatorio"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />

              <button
                type="button"
                onClick={() => void adjustStock()}
                className="rounded bg-orange-600 p-2 font-bold text-white"
              >
                Registrar ajuste
              </button>
            </div>
          </div>

          <div className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">Stock actual</h2>

            <div className="space-y-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-gray-500">
                      {Number(p.price).toFixed(2)} €/
                      {p.unit === "G" ? "g" : "ud"}
                    </div>
                  </div>

                  <strong
                    className={
                      Number(p.stock) <= 5
                        ? "text-red-600"
                        : "text-green-700"
                    }
                  >
                    {Number(p.stock).toFixed(2)} {p.unit}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Historial de movimientos</h2>

          {moves.length === 0 && (
            <div className="rounded bg-gray-50 p-3 text-gray-500">
              No hay movimientos de stock todavía.
            </div>
          )}

          <div className="space-y-2">
            {moves.map((move) => (
              <div key={move.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{move.product.name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(move.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <span
                    className={`rounded px-3 py-1 text-sm ${typeClass(
                      move.type
                    )}`}
                  >
                    {typeLabel(move.type)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    Cantidad:{" "}
                    <strong>
                      {Number(move.qty).toFixed(2)} {move.product.unit}
                    </strong>
                  </div>

                  <div>
                    Antes:{" "}
                    <strong>
                      {Number(move.previousStock).toFixed(2)}{" "}
                      {move.product.unit}
                    </strong>
                  </div>

                  <div>
                    Después:{" "}
                    <strong>
                      {Number(move.newStock).toFixed(2)} {move.product.unit}
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
      </div>
    </main>
  );
}