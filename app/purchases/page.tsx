// app/purchases/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type PurchaseItemForm = {
  productId: string;
  qty: string;
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
    product: {
      name: string;
      unit: string;
    };
  }[];
};

const initialItem: PurchaseItemForm = {
  productId: "",
  qty: "",
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
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { ...initialItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanItems = items
      .filter((item) => item.productId && Number(item.qty) > 0)
      .map((item) => ({
        productId: Number(item.productId),
        qty: Number(item.qty),
        unitCost: Number(item.unitCost || 0),
      }));

    if (cleanItems.length === 0) {
      alert("Añade al menos un producto.");
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
    if (status === "PAID") return "bg-green-100 text-green-700";
    if (status === "PARTIAL") return "bg-yellow-100 text-yellow-700";
    if (status === "PENDING") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-700";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="text-sm text-gray-500">
          Registra compras a proveedores, entrada de stock y pagos parciales.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Nueva compra</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <select
              className="w-full rounded border p-3"
              value={form.supplierId}
              onChange={(e) =>
                setForm({ ...form, supplierId: e.target.value })
              }
              required
            >
              <option value="">Selecciona proveedor</option>
              {suppliers
                .filter((supplier) => supplier.active)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = products.find(
                  (p) => p.id === Number(item.productId)
                );

                return (
                  <div key={index} className="rounded border p-3">
                    <select
                      className="w-full rounded border p-2"
                      value={item.productId}
                      onChange={(e) =>
                        updateItem(index, { productId: e.target.value })
                      }
                      required
                    >
                      <option value="">Producto</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · stock {Number(p.stock).toFixed(2)} {p.unit}
                        </option>
                      ))}
                    </select>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        className="rounded border p-2"
                        type="number"
                        step={product?.unit === "UD" ? "1" : "0.01"}
                        min="0"
                        placeholder="Cantidad"
                        value={item.qty}
                        onChange={(e) =>
                          updateItem(index, { qty: e.target.value })
                        }
                        required
                      />

                      <input
                        className="rounded border p-2"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Coste unidad"
                        value={item.unitCost}
                        onChange={(e) =>
                          updateItem(index, { unitCost: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-gray-500">
                        Línea:{" "}
                        <strong>
                          {(
                            Number(item.qty || 0) * Number(item.unitCost || 0)
                          ).toFixed(2)}{" "}
                          €
                        </strong>
                      </span>

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-red-600"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="w-full rounded border p-3 font-bold"
            >
              Añadir producto
            </button>

            <div className="rounded bg-gray-900 p-4 text-white">
              <div className="text-sm opacity-80">Total compra</div>
              <div className="text-3xl font-black">
                {totalAmount.toFixed(2)} €
              </div>
            </div>

            <input
              className="w-full rounded border p-3"
              type="number"
              step="0.01"
              min="0"
              placeholder="Pagado ahora (€)"
              value={form.paidAmount}
              onChange={(e) =>
                setForm({ ...form, paidAmount: e.target.value })
              }
            />

            <input
              className="w-full rounded border p-3"
              placeholder="Nota"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />

            <button
              disabled={loading}
              className="w-full rounded bg-blue-600 p-4 text-lg font-bold text-white disabled:opacity-40"
            >
              {loading ? "Registrando..." : "Registrar compra"}
            </button>
          </form>
        </section>

        <section className="rounded border p-4">
          <h2 className="mb-3 text-lg font-bold">Historial de compras</h2>

          {purchases.length === 0 && (
            <div className="rounded bg-gray-50 p-3 text-gray-500">
              No hay compras registradas.
            </div>
          )}

          <div className="space-y-3">
            {purchases.map((purchase) => (
              <div key={purchase.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{purchase.supplier.name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(purchase.createdAt).toLocaleString()}
                    </div>
                    {purchase.note && (
                      <div className="mt-1 text-sm text-gray-500">
                        {purchase.note}
                      </div>
                    )}
                  </div>

                  <span
                    className={`rounded px-3 py-1 text-sm font-bold ${statusClass(
                      purchase.status
                    )}`}
                  >
                    {statusLabel(purchase.status)}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    Total:{" "}
                    <strong>{Number(purchase.totalAmount).toFixed(2)} €</strong>
                  </div>
                  <div>
                    Pagado:{" "}
                    <strong>{Number(purchase.paidAmount).toFixed(2)} €</strong>
                  </div>
                  <div>
                    Pendiente:{" "}
                    <strong>
                      {(
                        Number(purchase.totalAmount) -
                        Number(purchase.paidAmount)
                      ).toFixed(2)}{" "}
                      €
                    </strong>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {purchase.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between rounded bg-gray-50 p-2 text-sm"
                    >
                      <span>
                        {item.product.name} · {Number(item.qty).toFixed(2)}{" "}
                        {item.product.unit} ×{" "}
                        {Number(item.unitCost).toFixed(2)} €
                      </span>
                      <strong>{Number(item.lineTotal).toFixed(2)} €</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}