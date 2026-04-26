// app/sales/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

type CartItem = {
  productId: number;
  qty: number;
};

export default function SalesPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [today, setToday] = useState({ grams: 0, units: 0 });

  const [memberId, setMemberId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
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

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === Number(productId)),
    [products, productId]
  );

  const cartLines = cart.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const price = product ? Number(product.price) : 0;
    const lineTotal = item.qty * price;

    return {
      ...item,
      product,
      lineTotal,
    };
  });

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
    return Number(line.product.stock) < line.qty;
  });

  const canAdd =
    !!selectedProduct &&
    qty > 0 &&
    !(selectedProduct.unit === "UD" && !Number.isInteger(qty));

  const invalid =
    !memberId ||
    cart.length === 0 ||
    overGrams ||
    overUnits ||
    stockProblems.length > 0 ||
    loading;

  function addToCart() {
    if (!selectedProduct || !canAdd) return;

    setCart((prev) => {
      const existing = prev.find((i) => i.productId === selectedProduct.id);

      if (existing) {
        return prev.map((i) =>
          i.productId === selectedProduct.id
            ? { ...i, qty: i.qty + qty }
            : i
        );
      }

      return [
        ...prev,
        {
          productId: selectedProduct.id,
          qty,
        },
      ];
    });

    setQty(1);
  }

  function removeFromCart(productId: number) {
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
        items: cart,
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
    setQty(1);

    const refreshedProducts = await fetch("/api/products").then((r) => r.json());
    setProducts(refreshedProducts);

    const refreshedToday = await fetch(`/api/members/${memberId}/today`).then((r) =>
      r.json()
    );
    setToday(refreshedToday);
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Retirada con carrito</h1>

      <div className="mb-4 rounded border bg-blue-50 p-3 text-sm">
        <div>
          Hoy: <strong>{today.grams.toFixed(2)} g</strong> / {DAILY_LIMIT_G} g ·{" "}
          <strong>{today.units.toFixed(0)} ud</strong> / {DAILY_LIMIT_UD} ud
        </div>

        <div className="mt-1">
          Con carrito:{" "}
          <strong className={overGrams ? "text-red-600" : "text-green-700"}>
            {gramsAfter.toFixed(2)} g
          </strong>{" "}
          ·{" "}
          <strong className={overUnits ? "text-red-600" : "text-green-700"}>
            {unitsAfter.toFixed(0)} ud
          </strong>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          className="w-full border p-2"
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

        <div className="rounded border p-3 space-y-3">
          <h2 className="font-semibold">Añadir producto</h2>

          <select
            className="w-full border p-2"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Selecciona producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.stock} {p.unit} · {Number(p.price).toFixed(2)} €/
                {p.unit === "G" ? "g" : "ud"}
              </option>
            ))}
          </select>

          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full border p-2"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />

          {selectedProduct && (
            <div className="text-sm text-gray-600">
              Línea:{" "}
              <strong>
                {(qty * Number(selectedProduct.price)).toFixed(2)} €
              </strong>
            </div>
          )}

          {selectedProduct?.unit === "UD" && !Number.isInteger(qty) && (
            <div className="rounded bg-red-100 p-2 text-sm text-red-700">
              Este producto requiere unidades enteras.
            </div>
          )}

          <button
            type="button"
            disabled={!canAdd}
            onClick={addToCart}
            className="w-full bg-gray-900 p-2 text-white disabled:opacity-40"
          >
            Añadir al carrito
          </button>
        </div>

        <div className="rounded border p-3">
          <h2 className="mb-3 font-semibold">Carrito</h2>

          {cartLines.length === 0 && (
            <div className="text-sm text-gray-500">No hay productos añadidos.</div>
          )}

          <div className="space-y-2">
            {cartLines.map((line) => (
              <div
                key={line.productId}
                className="flex items-center justify-between rounded border p-2"
              >
                <div>
                  <div className="font-medium">{line.product?.name}</div>
                  <div className="text-sm text-gray-500">
                    {line.qty} {line.product?.unit} ·{" "}
                    {line.lineTotal.toFixed(2)} €
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFromCart(line.productId)}
                  className="text-sm text-red-600"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 text-lg">
            Total: <strong>{cartTotal.toFixed(2)} €</strong>
          </div>
        </div>

        {overGrams && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            El carrito supera el límite diario de {DAILY_LIMIT_G} g.
          </div>
        )}

        {overUnits && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            El carrito supera el límite diario de {DAILY_LIMIT_UD} ud.
          </div>
        )}

        {stockProblems.length > 0 && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            Hay productos sin stock suficiente.
          </div>
        )}

        <button
          disabled={invalid}
          className="w-full bg-blue-600 p-2 text-white disabled:opacity-40"
        >
          {loading ? "Registrando..." : "Registrar retirada"}
        </button>
      </form>
    </main>
  );
}