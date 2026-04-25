"use client";

import { useEffect, useMemo, useState } from "react";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

export default function SalesPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [today, setToday] = useState({ grams: 0, units: 0 });

  const [memberId, setMemberId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
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

  const product = useMemo(
    () => products.find((p) => p.id === Number(productId)),
    [products, productId]
  );

  const total = product ? qty * Number(product.price) : 0;
  const stockAfter = product ? Number(product.stock) - qty : 0;

  const gramsAfter =
    product?.unit === "G" ? today.grams + qty : today.grams;

  const unitsAfter =
    product?.unit === "UD" ? today.units + qty : today.units;

  const overStock = !!product && stockAfter < 0;
  const overGrams = product?.unit === "G" && gramsAfter > DAILY_LIMIT_G;
  const overUnits = product?.unit === "UD" && unitsAfter > DAILY_LIMIT_UD;

  const invalid =
    !memberId ||
    !productId ||
    qty <= 0 ||
    overStock ||
    overGrams ||
    overUnits ||
    loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;

    setLoading(true);

    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: Number(memberId),
        productId: Number(productId),
        qty,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error al registrar retirada");
      return;
    }

    alert("Retirada registrada");

    setQty(1);

    const refreshedProducts = await fetch("/api/products").then((r) => r.json());
    setProducts(refreshedProducts);

    const refreshedToday = await fetch(`/api/members/${memberId}/today`).then((r) =>
      r.json()
    );
    setToday(refreshedToday);
  }

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Retirada rápida</h1>

      <div className="mb-4 rounded border bg-blue-50 p-3 text-sm">
        <div>
          Hoy: <strong>{today.grams.toFixed(2)} g</strong> / {DAILY_LIMIT_G} g ·{" "}
          <strong>{today.units.toFixed(0)} ud</strong> / {DAILY_LIMIT_UD} ud
        </div>

        {product && (
          <div className="mt-1">
            Precio: <strong>{Number(product.price).toFixed(2)} €/{product.unit === "G" ? "g" : "ud"}</strong>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          className="w-full border p-2"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          required
        >
          <option value="">Selecciona socio</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>

        <select
          className="w-full border p-2"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required
        >
          <option value="">Selecciona producto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.stock} {p.unit})
            </option>
          ))}
        </select>

        <input
          type="number"
          step="0.01"
          className="w-full border p-2"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          min="0"
        />

        {product && (
          <div className="rounded border p-3 text-sm space-y-1">
            <div>
              Total: <strong>{total.toFixed(2)} €</strong>
            </div>
            <div>
              Stock después:{" "}
              <strong className={overStock ? "text-red-600" : "text-green-700"}>
                {stockAfter.toFixed(2)} {product.unit}
              </strong>
            </div>

            {product.unit === "G" && (
              <div>
                Quedaría hoy:{" "}
                <strong className={overGrams ? "text-red-600" : "text-green-700"}>
                  {gramsAfter.toFixed(2)} g
                </strong>
              </div>
            )}

            {product.unit === "UD" && (
              <div>
                Quedaría hoy:{" "}
                <strong className={overUnits ? "text-red-600" : "text-green-700"}>
                  {unitsAfter.toFixed(0)} ud
                </strong>
              </div>
            )}
          </div>
        )}

        {overStock && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            Stock insuficiente.
          </div>
        )}

        {overGrams && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            Esta retirada supera el límite diario de {DAILY_LIMIT_G} g.
          </div>
        )}

        {overUnits && (
          <div className="rounded bg-red-100 p-3 text-sm text-red-700">
            Esta retirada supera el límite diario de {DAILY_LIMIT_UD} ud.
          </div>
        )}

        <button
          disabled={invalid}
          className="w-full bg-blue-600 text-white p-2 disabled:opacity-40"
        >
          {loading ? "Registrando..." : "Registrar retirada"}
        </button>
      </form>
    </main>
  );
}