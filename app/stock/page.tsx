"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type { ProductSummary, StockMoveRecord } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

export default function StockPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [moves, setMoves] = useState<StockMoveRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustType, setAdjustType] = useState<"ADD" | "REMOVE">("REMOVE");
  const [transferQty, setTransferQty] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const [form, setForm] = useState({
    productId: "",
    type: "IN",
    qty: "",
    note: "",
  });

  async function loadData() {
    try {
      const [productsData, movesData] = await Promise.all([
        fetchJson<ProductSummary[]>("/api/products"),
        fetchJson<StockMoveRecord[]>("/api/stock/moves"),
      ]);

      setProducts(productsData);
      setMoves(movesData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando stock");
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === Number(form.productId));
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

  async function adjustStock() {
    if (!selectedProduct) {
      alert("Selecciona producto");
      return;
    }

    const qty = Number(adjustQty);

    if (!qty || qty <= 0) {
      alert("Cantidad invalida");
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
        productId: selectedProduct.id,
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

  async function transferFromReserve() {
    if (!selectedProduct) {
      alert("Selecciona producto");
      return;
    }

    const qty = Number(transferQty);

    if (!qty || qty <= 0) {
      alert("Cantidad invalida");
      return;
    }

    const res = await fetch("/api/stock/move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: selectedProduct.id,
        type: "TRANSFER",
        qty,
        note: transferNote,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error reponiendo stock");
      return;
    }

    setTransferQty("");
    setTransferNote("");

    await loadData();
  }

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
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Stock"
        description="Disponible para retiradas, reserva, ajustes e historial de movimientos."
      />

      {error && <EmptyState message={error} className="mb-4" />}

      <Link
        href="/stock/history"
        className="mb-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-white"
      >
        Ver historial de stock
      </Link>
      <Link
        href="/stock/counts"
        className="mb-4 ml-2 inline-flex rounded-full border border-black/10 bg-white px-4 py-2 font-semibold"
      >
        Conteos de inventario
      </Link>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
        <section className="space-y-4">
          <div className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-3 text-lg font-bold">Nuevo movimiento</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <select
                className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                required
              >
                <option value="">Selecciona producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · disp. {Number(product.stock).toFixed(2)} {product.unit} ·
                    reserva {Number(product.reserveStock).toFixed(2)} {product.unit}
                  </option>
                ))}
              </select>

              {selectedProduct && (
                <div className="rounded-2xl bg-gray-50 p-3 text-sm">
                  <div>
                    Disponible actual:{" "}
                    <strong>
                      {Number(selectedProduct.stock).toFixed(2)} {selectedProduct.unit}
                    </strong>
                  </div>
                  <div>
                    Reserva actual:{" "}
                    <strong>
                      {Number(selectedProduct.reserveStock).toFixed(2)} {selectedProduct.unit}
                    </strong>
                  </div>
                </div>
              )}

              <select
                className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="IN">Entrada</option>
                <option value="OUT">Salida</option>
                <option value="ADJUST">Ajuste / cuadre</option>
              </select>

              <input
                className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                type="number"
                step={selectedProduct?.unit === "UD" ? "1" : "0.01"}
                min="0"
                placeholder={
                  form.type === "ADJUST"
                    ? "Nuevo stock final disponible"
                    : "Cantidad del movimiento"
                }
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                placeholder="Nota / motivo"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />

              <button
                disabled={loading}
                className="app-button-primary w-full rounded-2xl p-3 font-bold disabled:opacity-40"
              >
                {loading ? "Guardando..." : "Registrar movimiento"}
              </button>
            </form>
          </div>

          <div className="app-panel rounded-3xl p-4 md:p-5">
            <h3 className="mb-3 font-bold">Ajuste manual</h3>

            <div className="grid gap-2">
              <select
                className="rounded-2xl border border-black/10 bg-white/80 p-2"
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as "ADD" | "REMOVE")}
              >
                <option value="REMOVE">Salida / Merma</option>
                <option value="ADD">Entrada / Correccion</option>
              </select>

              <input
                className="rounded-2xl border border-black/10 bg-white/80 p-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Cantidad"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
              />

              <input
                className="rounded-2xl border border-black/10 bg-white/80 p-2"
                placeholder="Motivo obligatorio"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />

              <button
                type="button"
                onClick={() => void adjustStock()}
                className="rounded-2xl bg-orange-600 p-3 font-bold text-white"
              >
                Registrar ajuste
              </button>
            </div>
          </div>

          <div className="app-panel rounded-3xl p-4 md:p-5">
            <h3 className="mb-3 font-bold">Reposicion desde reserva</h3>

            <div className="grid gap-2">
              <input
                className="rounded-2xl border border-black/10 bg-white/80 p-2"
                type="number"
                min="0"
                step={selectedProduct?.unit === "UD" ? "1" : "0.01"}
                placeholder="Cantidad a pasar a disponible"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
              />

              <input
                className="rounded-2xl border border-black/10 bg-white/80 p-2"
                placeholder="Nota opcional"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
              />

              <button
                type="button"
                onClick={() => void transferFromReserve()}
                className="rounded-2xl bg-cyan-700 p-3 font-bold text-white"
              >
                Reponer mostrador
              </button>
            </div>
          </div>

          <div className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-3 text-lg font-bold">Stock actual</h2>

            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-2xl border border-black/8 bg-white/72 p-3"
                >
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-sm text-gray-500">
                      {Number(product.price).toFixed(2)} EUR/
                      {product.unit === "G" ? "g" : "ud"}
                    </div>
                    <div className="text-sm text-gray-500">
                      Reserva: {Number(product.reserveStock).toFixed(2)} {product.unit} ·
                      total fisico {(Number(product.stock) + Number(product.reserveStock)).toFixed(2)}{" "}
                      {product.unit}
                    </div>
                  </div>

                  <div className="text-right">
                    <strong
                      className={
                        Number(product.stock) <= 5 ? "text-red-600" : "text-green-700"
                      }
                    >
                      {Number(product.stock).toFixed(2)} {product.unit}
                    </strong>
                    <div className="text-xs text-gray-500">Disponible</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="app-panel rounded-3xl p-4 md:p-5">
          <h2 className="mb-3 text-lg font-bold">Historial de movimientos</h2>

          {moves.length === 0 && (
            <EmptyState message="No hay movimientos de stock todavia." />
          )}

          <div className="space-y-2">
            {moves.map((move) => (
              <div key={move.id} className="rounded-2xl border border-black/8 bg-white/72 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{move.product.name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(move.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <span className={`rounded px-3 py-1 text-sm ${typeClass(move.type)}`}>
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
                      {Number(move.previousStock).toFixed(2)} {move.product.unit}
                    </strong>
                  </div>

                  <div>
                    Despues:{" "}
                    <strong>
                      {Number(move.newStock).toFixed(2)} {move.product.unit}
                    </strong>
                  </div>
                </div>

                {move.note && (
                  <div className="mt-2 rounded-2xl bg-gray-50 p-2 text-sm text-gray-600">
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
