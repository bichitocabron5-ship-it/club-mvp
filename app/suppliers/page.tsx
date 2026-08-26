// app/suppliers/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        title="Proveedores"
        description="Gestiona proveedores, datos de contacto y notas para el aprovisionamiento del club."
      />

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Aprovisionamiento
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Nuevo proveedor
          </h2>

          <p className="mt-1 text-sm app-muted">
            Registra los datos básicos y de contacto del proveedor.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 p-5 sm:p-6 md:grid-cols-2"
        >
          <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
            Nombre del proveedor

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Nombre del proveedor"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Teléfono

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Teléfono"
              value={form.phone}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Correo electrónico

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="email"
              placeholder="correo@proveedor.com"
              value={form.email}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
            Notas

            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Condiciones, persona de contacto, observaciones..."
              value={form.notes}
              onChange={(e) =>
                setForm({
                  ...form,
                  notes: e.target.value,
                })
              }
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 font-bold sm:w-auto"
            >
              Crear proveedor
            </button>
          </div>
        </form>
      </section>

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Directorio
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Proveedores registrados
              </h2>

              <p className="mt-1 text-sm app-muted">
                Contactos disponibles para compras y aprovisionamiento.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {suppliers.length} proveedor{suppliers.length === 1 ? "" : "es"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {suppliers.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
              <div className="font-black text-[#201f1d]">
                Sin proveedores
              </div>

              <p className="mt-2 text-sm app-muted">
                Crea el primer proveedor para empezar a registrar compras.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {suppliers.map((supplier, index) => (
                <article
                  key={supplier.id}
                  className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-black tracking-[-0.02em] text-[#201f1d]">
                            {supplier.name}
                          </h3>

                          <div className="mt-1 text-xs app-muted">
                            Alta:{" "}
                            {new Date(supplier.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
                          supplier.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-black/10 bg-black/5 text-[#6d6860]"
                        }`}
                      >
                        {supplier.active ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                        <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                          Teléfono
                        </div>

                        <div className="mt-1 break-words font-bold text-[#201f1d]">
                          {supplier.phone || "No indicado"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#f7f4ee] px-3 py-3">
                        <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                          Correo
                        </div>

                        <div className="mt-1 break-all font-bold text-[#201f1d]">
                          {supplier.email || "No indicado"}
                        </div>
                      </div>
                    </div>

                    {supplier.notes ? (
                      <div className="mt-3 rounded-[1.25rem] border border-[#b4a78d]/20 bg-[#f7f4ee]/70 px-4 py-3">
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                          Notas
                        </div>

                        <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#201f1d]">
                          {supplier.notes}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}