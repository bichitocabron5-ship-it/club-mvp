"use client";

import type { ProductSummary, ProductUnit } from "@/lib/types";
import { useEffect, useState } from "react";

type ProductForm = {
  name: string;
  unit: ProductUnit;
  price: string;
  stock: string;
};

const initialForm: ProductForm = {
  name: "",
  unit: "G",
  price: "",
  stock: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);

  async function loadProducts() {
    const res = await fetch("/api/products");
    const data: ProductSummary[] = await res.json();
    setProducts(data);
  }

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/products")
      .then((res) => res.json())
      .then((data: ProductSummary[]) => {
        if (!cancelled) {
          setProducts(data);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    await fetch("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setForm(initialForm);
    await loadProducts();
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Productos</h1>

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
          onChange={(e) =>
            setForm({ ...form, unit: e.target.value as ProductUnit })
          }
        >
          <option value="G">Gramos (g)</option>
          <option value="UD">Unidades (ud)</option>
        </select>

        <input
          className="border p-2"
          placeholder="Precio EUR/g o EUR/ud"
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

        <button className="bg-blue-600 px-4 py-2 text-white">
          Crear producto
        </button>
      </form>

      <div className="space-y-2">
        {products.map((product) => (
          <div key={product.id} className="rounded border p-3">
            <strong>{product.name}</strong>
            <div>
              {product.stock} {product.unit} · {product.price} EUR/
              {product.unit === "G" ? "g" : "ud"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
