// app/suppliers/page.tsx
"use client";

import { useEffect, useState } from "react";

type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });

  async function loadSuppliers() {
    const res = await fetch("/api/suppliers");
    const data: Supplier[] = await res.json();
    setSuppliers(data);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadSuppliers();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      alert("Error creando proveedor");
      return;
    }

    setForm({
      name: "",
      phone: "",
      email: "",
      notes: "",
    });

    await loadSuppliers();
  }

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Proveedores</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-2 rounded border p-4"
      >
        <input
          className="w-full border p-3"
          placeholder="Nombre proveedor"
          value={form.name}
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
          required
        />

        <input
          className="w-full border p-3"
          placeholder="Teléfono"
          value={form.phone}
          onChange={(e) =>
            setForm({ ...form, phone: e.target.value })
          }
        />

        <input
          className="w-full border p-3"
          placeholder="Email"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        <textarea
          className="w-full border p-3"
          placeholder="Notas"
          value={form.notes}
          onChange={(e) =>
            setForm({ ...form, notes: e.target.value })
          }
        />

        <button className="w-full rounded bg-blue-600 p-3 font-bold text-white">
          Crear proveedor
        </button>
      </form>

      <div className="space-y-2">
        {suppliers.map((supplier) => (
          <div
            key={supplier.id}
            className="rounded border p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{supplier.name}</div>

                <div className="text-sm text-gray-500">
                  {supplier.phone || "Sin teléfono"}
                </div>

                {supplier.email && (
                  <div className="text-sm text-gray-500">
                    {supplier.email}
                  </div>
                )}
              </div>

              <span
                className={
                  supplier.active
                    ? "rounded bg-green-100 px-3 py-1 text-green-700"
                    : "rounded bg-red-100 px-3 py-1 text-red-700"
                }
              >
                {supplier.active ? "Activo" : "Inactivo"}
              </span>
            </div>

            {supplier.notes && (
              <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-600">
                {supplier.notes}
              </div>
            )}

            <div className="mt-2 text-xs text-gray-400">
              Creado el{" "}
              {new Date(supplier.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}