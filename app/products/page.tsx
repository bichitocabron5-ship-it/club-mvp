"use client";

import { ProductMenu } from "@/components/catalog/product-menu";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_HASH_TYPES,
  getProductCategoryLabel,
  getProductHashTypeLabel,
  isCatalogVisibleCategory,
} from "@/lib/types";
import type {
  CatalogProductSummary,
  ProductCategory,
  ProductHashType,
  ProductSummary,
  ProductUnit,
} from "@/lib/types";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type ProductForm = {
  name: string;
  description: string;
  unit: ProductUnit;
  price: string;
  category: ProductCategory;
  hashType: ProductHashType | "";
  minStock: string;
};

const initialForm: ProductForm = {
  name: "",
  description: "",
  unit: "G",
  price: "",
  category: "CANNABIS",
  hashType: "",
  minStock: "5",
};

function toEditableForm(product: ProductSummary): ProductForm {
  return {
    name: product.name,
    description: product.description ?? "",
    unit: product.unit,
    price: String(product.price),
    category: product.category,
    hashType: product.hashType ?? "",
    minStock: String(product.minStock),
  };
}

function toCatalogProduct(product: ProductSummary): CatalogProductSummary {
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    category: product.category,
    hashType: product.hashType,
    price: Number(product.price),
    unit: product.unit,
    imageUrl: product.imageUrl ?? null,
  };
}

export default function ProductsPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProductForm | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingImageFor, setUploadingImageFor] = useState<number | null>(null);

  const staffCatalogProducts = products
    .filter((product) => product.active && isCatalogVisibleCategory(product.category))
    .map(toCatalogProduct);

  async function loadProducts() {
    setLoading(true);

    try {
      const res = await fetch("/api/products", {
        cache: "no-store",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "No se pudieron cargar los productos");
      }

      const data = (await res.json()) as ProductSummary[];
      setProducts(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los productos"
      );
    } finally {
      setLoading(false);
    }
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
          description: form.description.trim() || null,
          unit: form.unit,
          price: Number(form.price),
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
      description: string | null;
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
      description: editForm.description.trim() || null,
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

  async function uploadProductImage(productId: number, file: File) {
    setUploadingImageFor(productId);
    setError("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`/api/products/${productId}/image`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Error subiendo imagen");
      }

      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploadingImageFor(null);
    }
  }

  if (status === "loading" && !session) {
    return (
      <ProductMenu
        badge="Catalogo"
        title="Catalogo de productos"
        description="Cargando vista de productos."
        products={[]}
        loading
      />
    );
  }

  if (!isAdmin) {
    return (
      <ProductMenu
        badge="Vista staff"
        title="Catalogo de productos"
        description="Vista limpia para mostrar el catalogo activo al socio sin datos internos de stock o costes."
        products={staffCatalogProducts}
        loading={loading || status === "loading"}
        error={error}
        note="Solo lectura para personal. Se ocultan stock, mínimos, costes y controles de gestión."
      />
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Productos</h1>
        <p className="mt-2 text-sm app-muted">
          Gestión completa para administrador con catálogo, stock, mínimos, activación e imágenes.
        </p>
        <p className="mt-2 text-sm text-[#5e6b61]">
          El stock se anade desde Compras o Movimientos de stock. Crear producto solo crea la
          ficha.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form className="app-panel mb-6 grid gap-3 rounded-3xl p-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSubmit}>
        <input
          className="rounded-2xl border border-black/10 bg-white/80 p-3"
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <textarea
          className="rounded-2xl border border-black/10 bg-white/80 p-3 md:col-span-2 xl:col-span-2"
          placeholder="Descripcion breve"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          maxLength={500}
        />

        <select
          className="rounded-2xl border border-black/10 bg-white/80 p-3"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}
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

        <select
          className="rounded-2xl border border-black/10 bg-white/80 p-3"
          value={form.category}
          onChange={(e) =>
            setForm({
              ...form,
              category: e.target.value as ProductCategory,
              hashType: e.target.value === "HASH" ? form.hashType : "",
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
          placeholder="Stock mínimo"
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

      {loading ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-52 animate-pulse rounded-3xl border border-black/6 bg-white/60"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {products.map((product) => {
            const lowStock = Number(product.stock) <= Number(product.minStock);
            const isEditing = editingProductId === product.id && editForm !== null;

            return (
              <div key={product.id} className="app-panel rounded-3xl p-4 md:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-28 w-28 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-[#eef1e8] text-center text-xs font-bold uppercase tracking-[0.18em] text-[#617063]">
                      Sin foto
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
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
                        Categoria: {getProductCategoryLabel(product.category)}
                        {product.hashType
                          ? ` - Subtipo: ${getProductHashTypeLabel(product.hashType)}`
                          : ""}
                      </div>

                      {product.description ? (
                        <div className="mt-2 text-sm text-gray-600">
                          {product.description}
                        </div>
                      ) : null}

                      <div className="mt-1 text-sm text-gray-500">
                        Precio: {Number(product.price).toFixed(2)} EUR/
                        {product.unit === "G" ? "g" : "ud"}
                      </div>
                    </div>

                    <div className="text-right">
                      <strong className={lowStock ? "text-red-600" : "text-green-700"}>
                        {Number(product.stock).toFixed(2)} {product.unit}
                      </strong>
                      <div className="text-xs text-gray-500">Disponible</div>
                      <div className="text-sm text-gray-500">
                        Reserva: {Number(product.reserveStock).toFixed(2)} {product.unit}
                      </div>
                      <div className="text-sm text-gray-500">
                        Total fisico:{" "}
                        {(Number(product.stock) + Number(product.reserveStock)).toFixed(2)} {product.unit}
                      </div>
                      <div className="text-sm text-gray-500">
                        Mínimo: {Number(product.minStock).toFixed(2)} {product.unit}
                      </div>
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

                    <textarea
                      className="rounded-2xl border border-black/10 bg-white p-3"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                      placeholder="Descripcion breve"
                      rows={3}
                      maxLength={500}
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
                        className="rounded-2xl border border-black/10 bg-white p-3"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.minStock}
                        onChange={(e) =>
                          setEditForm({ ...editForm, minStock: e.target.value })
                        }
                        placeholder="Stock mínimo"
                      />

                    </div>

                    <div className="text-sm text-gray-600">
                      Disponible actual: {Number(product.stock).toFixed(2)} {product.unit} ·
                      Reserva actual: {Number(product.reserveStock).toFixed(2)} {product.unit}
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Para modificar stock usa Compras o Stock. Desde producto solo se edita la
                      ficha y el stock minimo.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <label className="cursor-pointer rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#25352f]">
                        {uploadingImageFor === product.id ? "Subiendo..." : "Subir imagen"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (file) {
                              void uploadProductImage(product.id, file);
                            }
                          }}
                          disabled={uploadingImageFor === product.id}
                        />
                      </label>

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
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#25352f]">
                      {uploadingImageFor === product.id ? "Subiendo..." : "Subir imagen"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = "";
                          if (file) {
                            void uploadProductImage(product.id, file);
                          }
                        }}
                        disabled={uploadingImageFor === product.id}
                      />
                    </label>

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
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
