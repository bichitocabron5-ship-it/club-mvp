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
    setError("");

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
      const err: { error?: string } = await res.json();
      setError(err.error || "Error registrando movimiento");
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
      setError("Selecciona producto");
      return;
    }

    const qty = Number(adjustQty);

    if (!qty || qty <= 0) {
      setError("Cantidad inválida");
      return;
    }

    if (adjustReason.trim().length < 3) {
      setError("Indica motivo");
      return;
    }

    setError("");

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
      const err: { error?: string } = await res.json();
      setError(err.error || "Error ajustando stock");
      return;
    }

    setAdjustQty("");
    setAdjustReason("");

    await loadData();
  }

  async function transferFromReserve() {
    if (!selectedProduct) {
      setError("Selecciona producto");
      return;
    }

    const qty = Number(transferQty);

    if (!qty || qty <= 0) {
      setError("Cantidad inválida");
      return;
    }

    setError("");

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
      const err: { error?: string } = await res.json();
      setError(err.error || "Error reponiendo stock");
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
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Stock"
        description="Disponible para retiradas, reserva, ajustes e historial de movimientos."
      />

      {error && <EmptyState message={error} className="mb-4" />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Link
          href="/stock/history"
          className="group app-panel flex items-center justify-between rounded-[1.5rem] p-4 transition-all hover:-translate-y-0.5 hover:border-[#a7282d]/20 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)]"
        >
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#a7282d]">
              Historial
            </div>

            <div className="mt-1 font-black text-[#201f1d]">
              Movimientos de stock
            </div>

            <div className="mt-1 text-sm app-muted">
              Consulta entradas, salidas y ajustes anteriores.
            </div>
          </div>

          <span
            aria-hidden="true"
            className="text-xl font-black text-[#a7282d]/50 transition-transform group-hover:translate-x-1 group-hover:text-[#a7282d]"
          >
            →
          </span>
        </Link>

        <Link
          href="/stock/counts"
          className="group app-panel flex items-center justify-between rounded-[1.5rem] p-4 transition-all hover:-translate-y-0.5 hover:border-[#b4a78d]/40 hover:shadow-[0_10px_28px_rgba(22,20,18,0.06)]"
        >
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#6d6860]">
              Inventario
            </div>

            <div className="mt-1 font-black text-[#201f1d]">
              Conteos de inventario
            </div>

            <div className="mt-1 text-sm app-muted">
              Abre, revisa y confirma conteos físicos.
            </div>
          </div>

          <span
            aria-hidden="true"
            className="text-xl font-black text-[#b4a78d] transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
        <section className="space-y-4">
          <section className="app-panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Operación de stock
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Nuevo movimiento
              </h2>

              <p className="mt-1 text-sm app-muted">
                Registra una entrada, salida o ajuste del stock disponible.
              </p>
            </div>

            <div className="p-5 sm:p-6">

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="grid gap-3 rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee]/80 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Disponible
                    </div>

                    <div className="mt-1 text-xl font-black text-[#201f1d]">
                      {Number(selectedProduct.stock).toFixed(2)} {selectedProduct.unit}
                    </div>
                  </div>

                  <div>
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Reserva
                    </div>

                    <div className="mt-1 text-xl font-black text-[#861f23]">
                      {Number(selectedProduct.reserveStock).toFixed(2)} {selectedProduct.unit}
                    </div>
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
                type="submit"
                disabled={loading}
                className="app-button-primary w-full rounded-2xl p-3 font-bold disabled:opacity-40"
              >
                {loading ? "Guardando..." : "Registrar movimiento"}
              </button>
            </form>
          </div>
          </section>

          <section className="app-panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-amber-500" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-amber-800">
                  Ajuste manual
                </span>
              </div>

              <h3 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Corregir stock
              </h3>

              <p className="mt-1 text-sm app-muted">
                Registra una merma, corrección o entrada manual con motivo obligatorio.
              </p>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              {!selectedProduct ? (
                <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Selecciona primero un producto en el bloque de movimiento principal.
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee]/75 p-4">
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                    Producto seleccionado
                  </div>

                  <div className="mt-1 font-black text-[#201f1d]">
                    {selectedProduct.name}
                  </div>

                  <div className="mt-1 text-sm app-muted">
                    Disponible actual:{" "}
                    <strong>
                      {Number(selectedProduct.stock).toFixed(2)} {selectedProduct.unit}
                    </strong>
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                <label className="text-sm font-bold text-[#201f1d]">
                  Tipo de ajuste

                  <select
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                    value={adjustType}
                    onChange={(e) =>
                      setAdjustType(e.target.value as "ADD" | "REMOVE")
                    }
                  >
                    <option value="REMOVE">Salida / Merma</option>
                    <option value="ADD">Entrada / Corrección</option>
                  </select>
                </label>

                <label className="text-sm font-bold text-[#201f1d]">
                  Cantidad

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                    type="number"
                    min="0"
                    step={selectedProduct?.unit === "UD" ? "1" : "0.01"}
                    placeholder="Cantidad"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                  />
                </label>

                <label className="text-sm font-bold text-[#201f1d]">
                  Motivo

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                    placeholder="Motivo obligatorio"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void adjustStock()}
                className="inline-flex w-full items-center justify-center rounded-xl bg-amber-600 px-5 py-3 font-bold text-white hover:bg-amber-700 sm:w-auto"
              >
                Registrar ajuste
              </button>
            </div>
          </section>

          <section className="app-panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Reposición
                </span>
              </div>

              <h3 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Reponer desde reserva
              </h3>

              <p className="mt-1 text-sm app-muted">
                Transfiere unidades de reserva al stock disponible del mostrador.
              </p>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              {!selectedProduct ? (
                <div className="rounded-[1.25rem] border border-[#b4a78d]/30 bg-[#f7f4ee] px-4 py-3 text-sm text-[#645b4c]">
                  Selecciona primero un producto en el bloque de movimiento principal.
                </div>
              ) : (
                <div className="grid gap-3 rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee]/75 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Disponible
                    </div>

                    <div className="mt-1 text-lg font-black text-[#201f1d]">
                      {Number(selectedProduct.stock).toFixed(2)}{" "}
                      {selectedProduct.unit}
                    </div>
                  </div>

                  <div>
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Reserva
                    </div>

                    <div className="mt-1 text-lg font-black text-[#861f23]">
                      {Number(selectedProduct.reserveStock).toFixed(2)}{" "}
                      {selectedProduct.unit}
                    </div>
                  </div>
                </div>
              )}

              <label className="block text-sm font-bold text-[#201f1d]">
                Cantidad a transferir

                <input
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                  type="number"
                  min="0"
                  step={selectedProduct?.unit === "UD" ? "1" : "0.01"}
                  placeholder="Cantidad a pasar a disponible"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                />
              </label>

              <label className="block text-sm font-bold text-[#201f1d]">
                Nota

                <input
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                  placeholder="Nota opcional"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
              </label>

              <button
                type="button"
                onClick={() => void transferFromReserve()}
                className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold sm:w-auto"
              >
                Reponer mostrador
              </button>
            </div>
          </section>

          <section className="app-panel overflow-hidden rounded-[2rem]">
            <div className="border-b border-black/7 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                    <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                      Inventario
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Stock actual
                  </h2>

                  <p className="mt-1 text-sm app-muted">
                    Disponible, reserva y total físico por producto.
                  </p>
                </div>

                <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
                  {products.length} producto{products.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {products.length === 0 ? (
                <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                  <div className="font-black text-[#201f1d]">
                    Sin productos
                  </div>

                  <p className="mt-2 text-sm app-muted">
                    No hay productos disponibles para mostrar.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {products.map((product) => {
                    const availableStock = Number(product.stock);
                    const reserveStock = Number(product.reserveStock);
                    const totalPhysical = availableStock + reserveStock;
                    const lowStock = availableStock <= 5;

                    return (
                      <article
                        key={product.id}
                        className={`overflow-hidden rounded-[1.5rem] border bg-white/88 transition-all hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)] ${
                          lowStock
                            ? "border-red-100 hover:border-red-200"
                            : "border-black/8 hover:border-[#b4a78d]/40"
                        }`}
                      >
                        <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words font-black text-[#201f1d]">
                                {product.name}
                              </h3>

                              {lowStock ? (
                                <span className="app-badge app-badge-danger rounded-full px-3 py-1 text-xs">
                                  STOCK BAJO
                                </span>
                              ) : (
                                <span className="app-badge app-badge-positive rounded-full px-3 py-1 text-xs">
                                  STOCK OK
                                </span>
                              )}
                            </div>

                            <div className="mt-2 text-sm app-muted">
                              {Number(product.price).toFixed(2)} EUR/
                              {product.unit === "G" ? "g" : "ud"}
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 md:min-w-[430px]">
                            <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                                Disponible
                              </div>

                              <div
                                className={`mt-1 text-xl font-black tracking-[-0.03em] ${
                                  lowStock
                                    ? "text-red-700"
                                    : "text-emerald-700"
                                }`}
                              >
                                {availableStock.toFixed(2)} {product.unit}
                              </div>
                            </div>

                            <div className="rounded-2xl bg-[#f3f0e9] px-3 py-3">
                              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                                Reserva
                              </div>

                              <div className="mt-1 text-xl font-black tracking-[-0.03em] text-[#861f23]">
                                {reserveStock.toFixed(2)} {product.unit}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-black/7 bg-white px-3 py-3">
                              <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                                Total físico
                              </div>

                              <div className="mt-1 text-xl font-black tracking-[-0.03em] text-[#201f1d]">
                                {totalPhysical.toFixed(2)} {product.unit}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
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
                  Historial de movimientos
                </h2>

                <p className="mt-1 text-sm app-muted">
                  Entradas, salidas, reposiciones, ajustes y conteos registrados.
                </p>
              </div>

              <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
                {moves.length} movimiento{moves.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {moves.length === 0 ? (
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                <div className="font-black text-[#201f1d]">
                  Sin movimientos de stock
                </div>

                <p className="mt-2 text-sm app-muted">
                  Las operaciones de inventario aparecerán aquí cuando se registren.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {moves.map((move, index) => {
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
                              <h3 className="break-words font-black text-[#201f1d]">
                                {move.product.name}
                              </h3>

                              <div className="mt-1 text-xs app-muted">
                                {new Date(move.createdAt).toLocaleString("es-ES")}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-bold ${typeClass(
                              move.type,
                            )}`}
                          >
                            {typeLabel(move.type)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Cantidad
                            </div>

                            <div className="mt-1 font-black text-[#201f1d]">
                              {Number(move.qty).toFixed(2)} {move.product.unit}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-black/7 bg-white px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Antes
                            </div>

                            <div className="mt-1 font-black text-[#201f1d]">
                              {previousStock.toFixed(2)} {move.product.unit}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-black/7 bg-white px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Después
                            </div>

                            <div className="mt-1 font-black text-[#201f1d]">
                              {newStock.toFixed(2)} {move.product.unit}
                            </div>
                          </div>

                          <div
                            className={`rounded-2xl border px-3 py-3 ${
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

                            <div className="mt-1 break-words text-sm leading-6 text-[#201f1d]">
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
      </div>
    </main>
  );
}
