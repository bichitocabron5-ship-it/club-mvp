// app/products/page.tsx
"use client";

import {
  PRODUCT_CATEGORIES,
  PRODUCT_HASH_TYPES,
} from "@/lib/types";
import type {
  ProductCategory,
  ProductHashType,
  ProductSummary,
  ProductUnit,
} from "@/lib/types";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type ProductForm = {
  name: string;
  unit: ProductUnit;
  price: string;
  stock: string;
  category: ProductCategory;
  hashType: ProductHashType | "";
  minStock: string;
};

const initialForm: ProductForm = {
  name: "",
  unit: "G",
  price: "",
  stock: "",
  category: "CANNABIS",
  hashType: "",
  minStock: "5",
};

const hashTypeLabelMap = new Map(
  PRODUCT_HASH_TYPES.map((hashType) => [hashType.value, hashType.label])
);

function toEditableForm(product: ProductSummary): ProductForm {
  return {
    name: product.name,
    unit: product.unit,
    price: String(product.price),
    stock: String(product.stock),
    category: product.category,
    hashType: product.hashType ?? "",
    minStock: String(product.minStock),
  };
}

export default function ProductsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProductForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/products", {
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
          hashType: form.category === "HASH" ? form.hashType || null : null,
          minStock: Number(form.minStock || 5),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Error creando producto");
      }

      setForm(initialForm);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando producto");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(product: ProductSummary) {
    setEditingProductId(product.id);
    setEditForm(toEditableForm(product));
    setError("");
  }

  function cancelEditing() {
    setEditingProductId(null);
    setEditForm(null);
    setError("");
  }

  async function patchProduct(
    productId: number,
    payload: Partial<{
      name: string;
      unit: ProductUnit;
      price: number;
      category: ProductCategory;
      hashType: ProductHashType | null;
      minStock: number;
      active: boolean;
    }>
  ) {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Error actualizando producto");
      }

      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando producto");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function saveEditing(productId: number) {
    if (!editForm) return;

    await patchProduct(productId, {
      name: editForm.name,
      unit: editForm.unit,
      price: Number(editForm.price),
      category: editForm.category,
      hashType: editForm.category === "HASH" ? editForm.hashType || null : null,
      minStock: Number(editForm.minStock || 0),
    });

    cancelEditing();
  }

  async function toggleActive(product: ProductSummary) {
    await patchProduct(product.id, {
      active: !product.active,
    });
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Productos</h1>
        <p className="mt-2 text-sm app-muted">
          Catálogo y edición con mejor lectura en escritorio y tablet.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isAdmin ? (
        <form onSubmit={handleSubmit} className="app-panel mb-6 grid gap-3 rounded-3xl p-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <select
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            value={form.unit}
            onChange={(e) =>
              setForm({ ...form, unit: e.target.value as ProductUnit })
            }
          >
            <option value="G">Gramos (g)</option>
            <option value="UD">Unidades (ud)</option>
          </select>

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Precio EUR/g o EUR/ud"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Stock inicial"
            type="number"
            min="0"
            step="0.01"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />

          <select
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            value={form.category}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value as ProductCategory,
                hashType:
                  e.target.value === "HASH" ? form.hashType : "",
              })
            }
          >
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>

          {form.category === "HASH" ? (
            <select
              className="rounded-2xl border border-black/10 bg-white/80 p-3"
              value={form.hashType}
              onChange={(e) =>
                setForm({
                  ...form,
                  hashType: e.target.value as ProductHashType | "",
                })
              }
            >
              <option value="">Sin subtipo</option>
              {PRODUCT_HASH_TYPES.map((hashType) => (
                <option key={hashType.value} value={hashType.value}>
                  {hashType.label}
                </option>
              ))}
            </select>
          ) : null}

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            type="number"
            min="0"
            step="0.01"
            placeholder="Stock minimo"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
          />

          <button
            className="app-button-primary rounded-2xl px-4 py-3 font-bold disabled:opacity-60 md:col-span-2 xl:col-span-3"
            disabled={saving}
          >
            Crear producto
          </button>
        </form>
      ) : (
        <div className="app-panel mb-6 rounded-3xl p-4 text-sm app-muted">
          Vista de catalogo. Solo ADMIN puede crear, editar, activar o desactivar productos.
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {products.map((product) => {
          const lowStock = Number(product.stock) <= Number(product.minStock);
          const isEditing = editingProductId === product.id && editForm !== null;

          return (
            <div key={product.id} className="app-panel rounded-3xl p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>{product.name}</strong>

                    {lowStock ? (
                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                        STOCK BAJO
                      </span>
                    ) : null}

                    {!product.active ? (
                      <span className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-700">
                        INACTIVO
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    Categoria: {product.category}
                    {product.hashType
                      ? ` · Subtipo: ${hashTypeLabelMap.get(product.hashType) ?? product.hashType}`
                      : ""}
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
                    Minimo: {Number(product.minStock).toFixed(2)} {product.unit}
                  </div>
                </div>
              </div>

              {isEditing && editForm ? (
                <div className="mt-4 grid gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                  <input
                    className="rounded-2xl border border-black/10 bg-white p-3"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    placeholder="Nombre"
                  />

                  <div className="grid gap-2 md:grid-cols-2">
                    <select
                      className="rounded-2xl border border-black/10 bg-white p-3"
                      value={editForm.unit}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          unit: e.target.value as ProductUnit,
                        })
                      }
                    >
                      <option value="G">Gramos (g)</option>
                      <option value="UD">Unidades (ud)</option>
                    </select>

                    <select
                      className="rounded-2xl border border-black/10 bg-white p-3"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          category: e.target.value as ProductCategory,
                          hashType:
                            e.target.value === "HASH" ? editForm.hashType : "",
                        })
                      }
                    >
                      {PRODUCT_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editForm.category === "HASH" ? (
                    <select
                      className="rounded-2xl border border-black/10 bg-white p-3"
                      value={editForm.hashType}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          hashType: e.target.value as ProductHashType | "",
                        })
                      }
                    >
                      <option value="">Sin subtipo</option>
                      {PRODUCT_HASH_TYPES.map((hashType) => (
                        <option key={hashType.value} value={hashType.value}>
                          {hashType.label}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      className="rounded-2xl border border-black/10 bg-white p-3"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.price}
                      onChange={(e) =>
                        setEditForm({ ...editForm, price: e.target.value })
                      }
                      placeholder="Precio"
                    />

                    <input
                      className="rounded border p-3"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.minStock}
                      onChange={(e) =>
                        setEditForm({ ...editForm, minStock: e.target.value })
                      }
                      placeholder="Stock minimo"
                    />
                  </div>

                  <div className="text-sm text-gray-600">
                    Stock actual: {Number(product.stock).toFixed(2)} {product.unit}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEditing(product.id)}
                      className="app-button-primary rounded-full px-3 py-2 text-sm font-semibold disabled:opacity-60"
                      disabled={saving}
                    >
                      Guardar
                    </button>

                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="app-button-secondary rounded-full px-3 py-2 text-sm"
                      disabled={saving}
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleActive(product)}
                      className={`rounded-full px-3 py-2 text-sm ${
                        product.active
                          ? "bg-red-200 text-red-800"
                          : "bg-green-200 text-green-800"
                      }`}
                      disabled={saving}
                    >
                      {product.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              ) : isAdmin ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(product)}
                    className="app-button-secondary rounded-full px-3 py-2 text-sm"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleActive(product)}
                    className={`rounded-full px-3 py-2 text-sm ${
                      product.active
                        ? "bg-red-200 text-red-800"
                        : "bg-green-200 text-green-800"
                    }`}
                    disabled={saving}
                  >
                    {product.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
