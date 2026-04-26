// app/sales/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

type Member = {
  id: number;
  fullName: string;
  dni?: string;
};

type Product = {
  id: number;
  name: string;
  unit: "G" | "UD";
  price: number;
  stock: number;
};

type CartItem = {
  productId: number;
  qty: number;
};

export default function SalesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [today, setToday] = useState({ grams: 0, units: 0 });

  const [memberId, setMemberId] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/members").then((res) => res.json()).then(setMembers);
    fetch("/api/products").then((res) => res.json()).then(setProducts);
  }, []);

  useEffect(() => {
    if (!memberId) {
      setToday({ grams: 0, units: 0 });
      return;
    }

    fetch(`/api/members/${memberId}/today`)
      .then((res) => res.json())
      .then(setToday);
  }, [memberId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search]);

  const cartLines = useMemo(() => {
    return cart.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      const price = product ? Number(product.price) : 0;
      const stock = product ? Number(product.stock) : 0;
      const lineTotal = item.qty * price;

      return {
        ...item,
        product,
        price,
        stock,
        lineTotal,
      };
    });
  }, [cart, products]);

  const cartTotal = cartLines.reduce((acc, line) => acc + line.lineTotal, 0);

  const cartG = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "G") return acc + line.qty;
    return acc;
  }, 0);

  const cartUD = cartLines.reduce((acc, line) => {
    if (line.product?.unit === "UD") return acc + line.qty;
    return acc;
  }, 0);

  const gramsAfter = today.grams + cartG;
  const unitsAfter = today.units + cartUD;

  const overGrams = gramsAfter > DAILY_LIMIT_G;
  const overUnits = unitsAfter > DAILY_LIMIT_UD;

  const stockProblems = cartLines.filter((line) => {
    if (!line.product) return true;
    return line.qty > line.stock;
  });

  const invalid =
    !memberId ||
    cart.length === 0 ||
    overGrams ||
    overUnits ||
    stockProblems.length > 0 ||
    loading;

  function addProduct(product: Product) {
    if (Number(product.stock) <= 0) return;

    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);

      if (existing) {
        const nextQty =
          product.unit === "UD" ? existing.qty + 1 : existing.qty + 1;

        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: nextQty } : i
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          qty: 1,
        },
      ];
    });
  }

  function updateQty(productId: number, value: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    let qty = Number(value);

    if (!Number.isFinite(qty) || qty < 0) qty = 0;

    if (product.unit === "UD") {
      qty = Math.floor(qty);
    }

    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? {
              ...i,
              qty,
            }
          : i
      )
    );
  }

  function removeProduct(productId: number) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;

    setLoading(true);

    const res = await fetch("/api/sales/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: Number(memberId),
        items: cart.filter((i) => i.qty > 0),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error al registrar retirada");
      return;
    }

    alert("Retirada registrada");

    setCart([]);

    const refreshedProducts = await fetch("/api/products").then((r) => r.json());
    setProducts(refreshedProducts);

    const refreshedToday = await fetch(`/api/members/${memberId}/today`).then(
      (r) => r.json()
    );
    setToday(refreshedToday);
  }

  return (
    <main className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">TPV de retiradas</h1>
          <p className="text-sm text-gray-500">
            Modo mostrador/tablet · carrito multi-producto
          </p>
        </div>

        <div className="rounded border bg-blue-50 p-3 text-sm">
          Hoy: <strong>{today.grams.toFixed(2)} g</strong> / {DAILY_LIMIT_G} g ·{" "}
          <strong>{today.units.toFixed(0)} ud</strong> / {DAILY_LIMIT_UD} ud
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="rounded border p-3">
            <label className="mb-1 block text-sm font-medium">Socio</label>
            <select
              className="w-full rounded border p-3 text-base"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
                setCart([]);
              }}
              required
            >
              <option value="">Selecciona socio</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded border p-3">
            <label className="mb-1 block text-sm font-medium">
              Buscar producto
            </label>
            <input
              className="w-full rounded border p-3 text-base"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p) => {
              const noStock = Number(p.stock) <= 0;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  disabled={noStock}
                  className="min-h-32 rounded border p-3 text-left shadow-sm hover:bg-gray-50 disabled:opacity-40"
                >
                  <div className="font-semibold">{p.name}</div>

                  <div className="mt-1 text-sm text-gray-500">
                    Stock: {Number(p.stock).toFixed(2)} {p.unit}
                  </div>

                  <div className="mt-1 text-sm">
                    {Number(p.price).toFixed(2)} €/
                    {p.unit === "G" ? "g" : "ud"}
                  </div>

                  <div className="mt-3 text-sm font-medium text-blue-600">
                    {noStock ? "Sin stock" : "Añadir"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rounded border p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="mb-3 text-lg font-bold">Carrito</h2>

          {cartLines.length === 0 && (
            <div className="rounded bg-gray-50 p-3 text-sm text-gray-500">
              Añade productos para registrar una retirada.
            </div>
          )}

          <div className="space-y-3">
            {cartLines.map((line) => (
              <div key={line.productId} className="rounded border p-3">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{line.product?.name}</div>
                    <div className="text-sm text-gray-500">
                      Stock: {line.stock.toFixed(2)} {line.product?.unit}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeProduct(line.productId)}
                    className="text-sm text-red-600"
                  >
                    Quitar
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Cantidad</label>
                    <input
                      className="w-full rounded border p-2"
                      type="number"
                      step={line.product?.unit === "UD" ? "1" : "0.01"}
                      min="0"
                      value={line.qty}
                      onChange={(e) =>
                        updateQty(line.productId, e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500">Total línea</label>
                    <div className="rounded border bg-gray-50 p-2">
                      {line.lineTotal.toFixed(2)} €
                    </div>
                  </div>
                </div>

                {line.qty > line.stock && (
                  <div className="mt-2 rounded bg-red-100 p-2 text-sm text-red-700">
                    Stock insuficiente.
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded bg-gray-900 p-4 text-white">
            <div className="text-sm opacity-80">Total retirada</div>
            <div className="text-3xl font-bold">{cartTotal.toFixed(2)} €</div>
          </div>

          <div className="mt-3 rounded border p-3 text-sm">
            Con carrito:{" "}
            <strong className={overGrams ? "text-red-600" : "text-green-700"}>
              {gramsAfter.toFixed(2)} g
            </strong>{" "}
            ·{" "}
            <strong className={overUnits ? "text-red-600" : "text-green-700"}>
              {unitsAfter.toFixed(0)} ud
            </strong>
          </div>

          {overGrams && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Se supera el límite diario de {DAILY_LIMIT_G} g.
            </div>
          )}

          {overUnits && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Se supera el límite diario de {DAILY_LIMIT_UD} ud.
            </div>
          )}

          {stockProblems.length > 0 && (
            <div className="mt-3 rounded bg-red-100 p-3 text-sm text-red-700">
              Hay productos sin stock suficiente.
            </div>
          )}

          <button
            disabled={invalid}
            className="mt-4 w-full rounded bg-blue-600 p-4 text-lg font-bold text-white disabled:opacity-40"
          >
            {loading ? "Registrando..." : "Registrar retirada"}
          </button>
        </aside>
      </form>
    </main>
  );
}