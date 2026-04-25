// app/products/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    unit: "G",
    price: "",
    stock: "",
  });

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function handleSubmit(e: any) {
    e.preventDefault();

    await fetch("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setForm({ name: "", unit: "G", price: "", stock: "" });
    loadProducts();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Productos</h1>

      <form onSubmit={handleSubmit} className="mb-6 grid gap-2">
        <input
          className="border p-2"
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <select
          className="border p-2"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        >
          <option value="G">Gramos (g)</option>
          <option value="UD">Unidades (ud)</option>
        </select>

        <input
          className="border p-2"
          placeholder="Precio €/g o €/ud"
          type="number"
          step="0.01"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
        />

        <input
          className="border p-2"
          placeholder="Stock inicial"
          type="number"
          step="0.01"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />

        <button className="bg-blue-600 text-white px-4 py-2">
          Crear producto
        </button>
      </form>

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="border p-3 rounded">
            <strong>{p.name}</strong>
            <div>
              {p.stock} {p.unit} · {p.price} €/{p.unit === "G" ? "g" : "ud"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}