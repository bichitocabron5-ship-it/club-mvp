"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Supplier = {
  id: number;
  name: string;
  active: boolean;
};

type Product = {
  id: number;
  name: string;
  unit: string;
  stock: number;
  reserveStock: number;
};

type PurchaseItemForm = {
  productId: string;
  qty: string;
  availableQty: string;
  unitCost: string;
};

type Purchase = {
  id: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  note: string | null;
  createdAt: string;
  supplier: {
    name: string;
  };
  items: {
    id: number;
    qty: number;
    unitCost: number;
    lineTotal: number;
    availableQty?: number;
    reserveQty?: number;
    product: {
      name: string;
      unit: string;
    };
  }[];
};

const initialItem: PurchaseItemForm = {
  productId: "",
  qty: "",
  availableQty: "",
  unitCost: "",
};

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    supplierId: "",
    paidAmount: "",
    note: "",
  });

  const [items, setItems] = useState<PurchaseItemForm[]>([{ ...initialItem }]);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>({});

  async function loadData() {
    const [suppliersRes, productsRes, purchasesRes] = await Promise.all([
      fetch("/api/suppliers"),
      fetch("/api/products"),
      fetch("/api/purchases"),
    ]);

    const suppliersData: Supplier[] = await suppliersRes.json();
    const productsData: Product[] = await productsRes.json();
    const purchasesData: Purchase[] = await purchasesRes.json();

    setSuppliers(suppliersData);
    setProducts(productsData);
    setPurchases(purchasesData);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const totalAmount = useMemo(() => {
    return items.reduce((acc, item) => {
      const qty = Number(item.qty || 0);
      const unitCost = Number(item.unitCost || 0);
      return acc + qty * unitCost;
    }, 0);
  }, [items]);

  function updateItem(index: number, patch: Partial<PurchaseItemForm>) {
    setItems((prev) =>
      prev.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { ...initialItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanItems = items
      .filter((item) => item.productId && Number(item.qty) > 0)
      .map((item) => {
        const qty = Number(item.qty);
        const availableQty = Math.min(Math.max(0, Number(item.availableQty || 0)), qty);

        return {
          productId: Number(item.productId),
          qty,
          availableQty,
          unitCost: Number(item.unitCost || 0),
        };
      });

    if (cleanItems.length === 0) {
      alert("Anade al menos un producto.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplierId: Number(form.supplierId),
        paidAmount: Number(form.paidAmount || 0),
        note: form.note,
        items: cleanItems,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error registrando compra");
      return;
    }

    setForm({
      supplierId: "",
      paidAmount: "",
      note: "",
    });
    setItems([{ ...initialItem }]);

    await loadData();
  }

  function statusLabel(status: string) {
    if (status === "PAID") return "Pagada";
    if (status === "PARTIAL") return "Parcial";
    if (status === "PENDING") return "Pendiente";
    return status;
  }

  function statusClass(status: string) {
    if (status === "PAID") {
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (status === "PARTIAL") {
      return "border border-amber-200 bg-amber-50 text-amber-800";
    }

    if (status === "PENDING") {
      return "border border-red-200 bg-red-50 text-red-700";
    }

    return "border border-black/10 bg-black/5 text-[#6d6860]";
  }

  async function payPurchase(purchaseId: number) {
    const amount = Number(paymentAmounts[purchaseId] || 0);

    if (!amount || amount <= 0) {
      alert("Introduce un importe valido");
      return;
    }

    const res = await fetch(`/api/purchases/${purchaseId}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        paidMethod: "CASH",
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error registrando pago");
      return;
    }

    setPaymentAmounts((prev) => ({
      ...prev,
      [purchaseId]: "",
    }));

    await loadData();
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        title="Compras"
        description="Registra compras, distribuye stock entre disponible y reserva y controla pagos pendientes a proveedores."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(380px,0.82fr)_minmax(0,1.18fr)]">
        <section className="app-panel overflow-hidden rounded-[2rem]">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Aprovisionamiento
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Nueva compra
            </h2>

            <p className="mt-1 text-sm app-muted">
              Selecciona proveedor, productos, cantidades y distribución inicial del stock.
            </p>
          </div>

          <div className="p-5 sm:p-6">

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-bold text-[#201f1d]">
              Proveedor
            </label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              required
            >
              <option value="">Selecciona un proveedor</option>
              {suppliers
                .filter((supplier) => supplier.active)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>

            <div className="flex items-center justify-between gap-3 border-t border-black/7 pt-4">
              <div>
                <h3 className="font-black text-[#201f1d]">
                  Productos de la compra
                </h3>

                <p className="mt-1 text-sm app-muted">
                  Añade una o varias líneas con cantidad y coste unitario.
                </p>
              </div>

              <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-xs font-bold text-[#6d6860]">
                {items.length} línea{items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = products.find((candidate) => candidate.id === Number(item.productId));
                const qty = Number(item.qty || 0);
                const availableQty = Math.min(Math.max(0, Number(item.availableQty || 0)), qty);
                const reserveQty = Math.max(0, qty - availableQty);

                return (
                  <div
                    key={index}
                    className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88"
                  >
                    <div className="border-b border-black/7 bg-[#f7f4ee]/65 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div>
                            <div className="font-black text-[#201f1d]">
                              Línea de compra
                            </div>

                            <div className="mt-1 text-xs app-muted">
                              Producto, cantidad y distribución de stock.
                            </div>
                          </div>
                        </div>

                        {items.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                          >
                            Quitar línea
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      <label className="block text-sm font-bold text-[#201f1d]">
                        Producto

                        <select
                          className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                          value={item.productId}
                          onChange={(e) =>
                            updateItem(index, {
                              productId: e.target.value,
                            })
                          }
                          required
                        >
                          <option value="">Selecciona un producto</option>

                          {products.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name} · disp.{" "}
                              {Number(candidate.stock).toFixed(2)} {candidate.unit} · reserva{" "}
                              {Number(candidate.reserveStock).toFixed(2)} {candidate.unit}
                            </option>
                          ))}
                        </select>
                      </label>

                      {product ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Disponible actual
                            </div>

                            <div className="mt-1 text-lg font-black text-[#201f1d]">
                              {Number(product.stock).toFixed(2)} {product.unit}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#f3f0e9] px-3 py-3">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Reserva actual
                            </div>

                            <div className="mt-1 text-lg font-black text-[#861f23]">
                              {Number(product.reserveStock).toFixed(2)} {product.unit}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="block text-sm font-bold text-[#201f1d]">
                          Cantidad comprada

                          <input
                            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                            type="number"
                            step={product?.unit === "UD" ? "1" : "0.01"}
                            min="0"
                            placeholder="Cantidad"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(index, {
                                qty: e.target.value,
                              })
                            }
                            required
                          />
                        </label>

                        <label className="block text-sm font-bold text-[#201f1d]">
                          Disponible ahora

                          <input
                            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                            type="number"
                            step={product?.unit === "UD" ? "1" : "0.01"}
                            min="0"
                            max={item.qty || undefined}
                            placeholder="Disponible"
                            value={item.availableQty}
                            onChange={(e) =>
                              updateItem(index, {
                                availableQty: e.target.value,
                              })
                            }
                          />
                        </label>

                        <label className="block text-sm font-bold text-[#201f1d]">
                          Coste unitario

                          <div className="relative mt-2">
                            <input
                              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-10 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={item.unitCost}
                              onChange={(e) =>
                                updateItem(index, {
                                  unitCost: e.target.value,
                                })
                              }
                              required
                            />

                            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold app-muted">
                              €
                            </span>
                          </div>
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] p-4">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Reserva calculada
                          </div>

                          <div className="mt-1 text-xl font-black text-[#201f1d]">
                            {reserveQty.toFixed(2)} {product?.unit ?? ""}
                          </div>

                          <p className="mt-1 text-xs app-muted">
                            Cantidad comprada menos disponible inmediato.
                          </p>
                        </div>

                        <div className="rounded-[1.25rem] border border-[#a7282d]/15 bg-[#a7282d]/5 p-4">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Total línea
                          </div>

                          <div className="mt-1 text-xl font-black text-[#861f23]">
                            {(qty * Number(item.unitCost || 0)).toFixed(2)} €
                          </div>

                          <p className="mt-1 text-xs app-muted">
                            Cantidad × coste unitario.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-3 font-bold"
            >
              + Añadir producto
            </button>

            <div className="overflow-hidden rounded-[1.75rem] border border-black/8 bg-[#f7f4ee]/75">
              <div className="border-b border-black/7 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                    Resumen de compra
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-[#a7282d]" />

                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Total compra
                    </div>

                    <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#861f23]">
                      {totalAmount.toFixed(2)} €
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 p-4">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-[#b4a78d]" />

                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Pendiente estimado
                    </div>

                    <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
                      {Math.max(
                        0,
                        totalAmount - Number(form.paidAmount || 0),
                      ).toFixed(2)}{" "}
                      €
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[#b4a78d]/30 bg-white/70 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f0e9] font-black text-[#861f23]"
                    >
                      i
                    </span>

                    <div>
                      <div className="font-black text-[#201f1d]">
                        Distribución del stock
                      </div>

                      <p className="mt-1 text-sm leading-6 app-muted">
                        Por defecto, toda compra entra en reserva. Si indicas una cantidad
                        en “Disponible ahora”, esa parte pasa a stock disponible y el resto
                        permanece en reserva.
                      </p>
                    </div>
                  </div>
                </div>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Pagado ahora

                  <div className="relative mt-2">
                    <input
                      className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-10 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                      type="number"
                      step="0.01"
                      min="0"
                      max={totalAmount || undefined}
                      placeholder="0,00"
                      value={form.paidAmount}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          paidAmount: e.target.value,
                        })
                      }
                    />

                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold app-muted">
                      €
                    </span>
                  </div>

                  <span className="mt-2 block text-xs font-normal app-muted">
                    Si no se paga el total, la diferencia quedará registrada como deuda
                    pendiente.
                  </span>
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Nota

                  <textarea
                    className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    placeholder="Observaciones de la compra"
                    value={form.note}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        note: e.target.value,
                      })
                    }
                  />
                </label>

                <div className="border-t border-black/7 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? "Registrando compra..." : "Registrar compra"}
                  </button>
                </div>
              </div>
            </div>
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
                  Historial de compras
                </h2>

                <p className="mt-1 text-sm app-muted">
                  Compras registradas, pagos realizados y deuda pendiente.
                </p>
              </div>

              <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
                {purchases.length} compra{purchases.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {purchases.length === 0 ? (
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                <div className="font-black text-[#201f1d]">
                  Sin compras registradas
                </div>

                <p className="mt-2 text-sm app-muted">
                  Las compras realizadas aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {purchases.map((purchase, index) => {
                  const total = Number(purchase.totalAmount);
                  const paid = Number(purchase.paidAmount);
                  const pending = Math.max(0, total - paid);

                  return (
                    <article
                      key={purchase.id}
                      className="overflow-hidden rounded-[1.75rem] border border-black/8 bg-white/88"
                    >
                      <div className="border-b border-black/7 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                              {String(index + 1).padStart(2, "0")}
                            </span>

                            <div className="min-w-0">
                              <h3 className="break-words text-lg font-black text-[#201f1d]">
                                {purchase.supplier.name}
                              </h3>

                              <div className="mt-1 text-sm app-muted">
                                {new Date(purchase.createdAt).toLocaleString()}
                              </div>

                              {purchase.note ? (
                                <div className="mt-2 text-sm leading-6 text-[#645b4c]">
                                  {purchase.note}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <span
                            className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                              purchase.status,
                            )}`}
                          >
                            {statusLabel(purchase.status)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 sm:p-5">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-[#f7f4ee] p-4">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Total
                            </div>

                            <div className="mt-1 text-xl font-black text-[#201f1d]">
                              {total.toFixed(2)} €
                            </div>
                          </div>

                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-emerald-700/70">
                              Pagado
                            </div>

                            <div className="mt-1 text-xl font-black text-emerald-700">
                              {paid.toFixed(2)} €
                            </div>
                          </div>

                          <div
                            className={`rounded-2xl border p-4 ${
                              pending > 0
                                ? "border-red-100 bg-red-50/70"
                                : "border-emerald-100 bg-emerald-50/70"
                            }`}
                          >
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                              Pendiente
                            </div>

                            <div
                              className={`mt-1 text-xl font-black ${
                                pending > 0
                                  ? "text-red-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {pending.toFixed(2)} €
                            </div>
                          </div>
                        </div>

                        {purchase.status !== "PAID" ? (
                          <div className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50/70">
                            <div className="border-b border-amber-200 px-4 py-3">
                              <div className="font-black text-amber-950">
                                Registrar pago pendiente
                              </div>

                              <p className="mt-1 text-sm text-amber-900">
                                Introduce el importe abonado al proveedor.
                              </p>
                            </div>

                            <div className="flex flex-col gap-3 p-4 sm:flex-row">
                              <div className="relative flex-1">
                                <input
                                  className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 pr-10 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={pending || undefined}
                                  placeholder="Importe a pagar"
                                  value={paymentAmounts[purchase.id] || ""}
                                  onChange={(e) =>
                                    setPaymentAmounts((prev) => ({
                                      ...prev,
                                      [purchase.id]: e.target.value,
                                    }))
                                  }
                                />

                                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-amber-800">
                                  €
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => void payPurchase(purchase.id)}
                                className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-3 font-bold text-white hover:bg-amber-700"
                              >
                                Registrar pago
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

                            <h4 className="font-black text-[#201f1d]">
                              Productos comprados
                            </h4>
                          </div>

                          <div className="space-y-2">
                            {purchase.items.map((item) => {
                              const availableQty = Number(item.availableQty ?? 0);
                              const reserveQty = Number(
                                item.reserveQty ??
                                  Math.max(
                                    0,
                                    Number(item.qty) - availableQty,
                                  ),
                              );

                              return (
                                <div
                                  key={item.id}
                                  className="rounded-[1.25rem] border border-black/8 bg-[#f7f4ee]/65 p-3.5"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="font-black text-[#201f1d]">
                                        {item.product.name}
                                      </div>

                                      <div className="mt-1 text-sm app-muted">
                                        {Number(item.qty).toFixed(2)}{" "}
                                        {item.product.unit} ×{" "}
                                        {Number(item.unitCost).toFixed(2)} €
                                      </div>
                                    </div>

                                    <div className="shrink-0 text-lg font-black text-[#861f23]">
                                      {Number(item.lineTotal).toFixed(2)} €
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-xl bg-white/80 px-3 py-2">
                                      <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                                        Disponible
                                      </div>

                                      <div className="mt-1 font-bold text-[#201f1d]">
                                        {availableQty.toFixed(2)}{" "}
                                        {item.product.unit}
                                      </div>
                                    </div>

                                    <div className="rounded-xl bg-white/80 px-3 py-2">
                                      <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                                        Reserva
                                      </div>

                                      <div className="mt-1 font-bold text-[#861f23]">
                                        {reserveQty.toFixed(2)}{" "}
                                        {item.product.unit}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
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
      </div>
    </main>
  );
}
