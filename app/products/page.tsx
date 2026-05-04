// app/products/page.tsx
"use client";

import type { ProductSummary, ProductUnit } from "@/lib/types";
import { useEffect, useState } from "react";

type ProductForm = {
  name: string;
  unit: ProductUnit;
  price: string;
  stock: string;
  category: string;
  minStock: string;
};

const initialForm: ProductForm = {
  name: "",
  unit: "G",
  price: "",
  stock: "",
  category: "CANNABIS",
  minStock: "5",
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
    const timeout = setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    await fetch("/api/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name,
        unit: form.unit,
        price: Number(form.price),
        stock: Number(form.stock || 0),
        category: form.category,
        minStock: Number(form.minStock || 5),
      }),
    });

    setForm(initialForm);
    await loadProducts();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Productos</h1>

      <form onSubmit={handleSubmit} className="mb-6 grid gap-2 rounded border p-4">
        <input
          className="rounded border p-3"
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <select
          className="rounded border p-3"
          value={form.unit}
          onChange={(e) =>
            setForm({ ...form, unit: e.target.value as ProductUnit })
          }
        >
          <option value="G">Gramos (g)</option>
          <option value="UD">Unidades (ud)</option>
        </select>

        <input
          className="rounded border p-3"
          placeholder="Precio EUR/g o EUR/ud"
          type="number"
          step="0.01"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
        />

        <input
          className="rounded border p-3"
          placeholder="Stock inicial"
          type="number"
          step="0.01"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />

        <select
          className="rounded border p-3"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="CANNABIS">Cannabis</option>
          <option value="SATIVA">Sativa</option>
          <option value="INDICA">Índica</option>
          <option value="HYBRID">Híbrida</option>
          <option value="CBD">CBD</option>
          <option value="RESIN">Resina</option>
          <option value="HASH">Hash</option>
          <option value="JOINT">Joint</option>
          <option value="DRINK">Bebida</option>
          <option value="FOOD">Comida</option>
          <option value="MERCH">Merchandising</option>
        </select>

        <input
          className="rounded border p-3"
          type="number"
          min="0"
          step="0.01"
          placeholder="Stock mínimo"
          value={form.minStock}
          onChange={(e) => setForm({ ...form, minStock: e.target.value })}
        />

        <button className="rounded bg-blue-600 px-4 py-3 font-bold text-white">
          Crear producto
        </button>
      </form>

      <div className="space-y-2">
        {products.map((product) => {
          const lowStock = Number(product.stock) <= Number(product.minStock);

          return (
            <div key={product.id} className="rounded border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <strong>{product.name}</strong>

                    {lowStock && (
                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                        STOCK BAJO
                      </span>
                    )}

                    {!product.active && (
                      <span className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700">
                        INACTIVO
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    Categoría: {product.category}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    Precio: {Number(product.price).toFixed(2)} EUR/
                    {product.unit === "G" ? "g" : "ud"}
                  </div>
                </div>

                <div className="text-right">
                  <strong className={lowStock ? "text-red-600" : "text-green-700"}>
                    {Number(product.stock).toFixed(2)} {product.unit}
                  </strong>

                  <div className="text-sm text-gray-500">
                    Mínimo: {Number(product.minStock).toFixed(2)} {product.unit}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newPrice = prompt("Nuevo precio:", String(product.price));
                    if (!newPrice) return;

                    fetch(`/api/products/${product.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ price: Number(newPrice) }),
                    }).then(loadProducts);
                  }}
                  className="rounded bg-gray-200 px-3 py-1 text-sm"
                >
                  Editar precio
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const newMinStock = prompt(
                      "Nuevo stock mínimo:",
                      String(product.minStock)
                    );
                    if (!newMinStock) return;

                    fetch(`/api/products/${product.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ minStock: Number(newMinStock) }),
                    }).then(loadProducts);
                  }}
                  className="rounded bg-gray-200 px-3 py-1 text-sm"
                >
                  Editar mínimo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fetch(`/api/products/${product.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: !product.active }),
                    }).then(loadProducts);
                  }}
                  className={`rounded px-3 py-1 text-sm ${
                    product.active
                      ? "bg-green-200 text-green-800"
                      : "bg-red-200 text-red-800"
                  }`}
                >
                  {product.active ? "Activo" : "Inactivo"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}