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

type SupplierForm = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

const emptySupplierForm: SupplierForm = {
  name: "",
  phone: "",
  email: "",
  notes: "",
};

function toSupplierForm(supplier: Supplier): SupplierForm {
  return {
    name: supplier.name,
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    notes: supplier.notes ?? "",
  };
}

async function readApiError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);
  const [editForm, setEditForm] =
    useState<SupplierForm>(emptySupplierForm);

  async function loadSuppliers() {
    const res = await fetch("/api/suppliers");

    if (!res.ok) {
      throw new Error(await readApiError(res, "Error cargando proveedores"));
    }

    const data: Supplier[] = await res.json();
    setSuppliers(data);
  }

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      void loadSuppliers().catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Error cargando proveedores"
          );
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setSavingKey("create");

    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error(
          await readApiError(res, "No se ha podido crear el proveedor.")
        );
      }

      setForm(emptySupplierForm);
      await loadSuppliers();
      setSuccess("Proveedor creado correctamente.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se ha podido crear el proveedor."
      );
    } finally {
      setSavingKey(null);
    }
  }

  function startEditing(supplier: Supplier) {
    setEditingId(supplier.id);
    setDeleteConfirmId(null);
    setEditForm(toSupplierForm(supplier));
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(emptySupplierForm);
  }

  async function handleEditSubmit(e: React.FormEvent, supplier: Supplier) {
    e.preventDefault();

    setError("");
    setSuccess("");
    setSavingKey(`edit-${supplier.id}`);

    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          notes: editForm.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Error actualizando proveedor")
        );
      }

      setEditingId(null);
      setEditForm(emptySupplierForm);
      await loadSuppliers();
      setSuccess("Proveedor actualizado correctamente.");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Error actualizando proveedor"
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleSupplierStatus(supplier: Supplier) {
    const nextActive = !supplier.active;

    setError("");
    setSuccess("");
    setSavingKey(`status-${supplier.id}`);

    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: nextActive,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Error actualizando estado del proveedor")
        );
      }

      await loadSuppliers();
      setSuccess(
        nextActive ? "Proveedor activado." : "Proveedor desactivado."
      );
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Error actualizando estado del proveedor"
      );
    } finally {
      setSavingKey(null);
    }
  }

  function requestDelete(supplier: Supplier) {
    setDeleteConfirmId(supplier.id);
    setEditingId(null);
    setError("");
    setSuccess("");
  }

  function cancelDelete() {
    setDeleteConfirmId(null);
  }

  async function deleteSupplier(supplier: Supplier) {
    setError("");
    setSuccess("");
    setSavingKey(`delete-${supplier.id}`);

    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Error eliminando proveedor"));
      }

      setDeleteConfirmId(null);
      await loadSuppliers();
      setSuccess("Proveedor eliminado.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Error eliminando proveedor"
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <PageHeader
        title="Proveedores"
        description="Gestiona proveedores, datos de contacto y notas para el aprovisionamiento del club."
      />

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            No se pudo completar la operación
          </div>

          <div className="mt-1 text-sm font-semibold text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          className="mb-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-emerald-700">
            Operación completada
          </div>

          <div className="mt-1 text-sm font-semibold text-emerald-700">
            {success}
          </div>
        </div>
      ) : null}

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
              disabled={savingKey !== null}
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {savingKey === "create" ? "Creando proveedor..." : "Crear proveedor"}
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
              {suppliers.map((supplier, index) => {
                const isEditing = editingId === supplier.id;
                const isDeleteConfirmOpen = deleteConfirmId === supplier.id;

                return (
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
                            {new Date(supplier.createdAt).toLocaleDateString("es-ES")}
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

                    {isEditing ? (
                      <form
                        onSubmit={(event) =>
                          void handleEditSubmit(event, supplier)
                        }
                        className="mt-4 overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70"
                      >
                        <div className="border-b border-[#b4a78d]/20 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="mb-1 flex items-center gap-2">
                                <span className="h-[2px] w-5 rounded-full bg-[#a7282d]" />

                                <span className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
                                  Edicion
                                </span>
                              </div>

                              <h4 className="font-black text-[#201f1d]">
                                Modificar proveedor
                              </h4>
                            </div>

                            <span className="rounded-full border border-[#b4a78d]/30 bg-white/70 px-3 py-1 text-xs font-bold text-[#645b4c]">
                              #{supplier.id}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                          <label className="block text-sm font-bold text-[#201f1d] sm:col-span-2">
                            Nombre del proveedor

                            <input
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                              placeholder="Nombre del proveedor"
                              value={editForm.name}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  name: e.target.value,
                                })
                              }
                              disabled={savingKey !== null}
                              required
                            />
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d]">
                            Telefono

                            <input
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                              placeholder="Telefono"
                              value={editForm.phone}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  phone: e.target.value,
                                })
                              }
                              disabled={savingKey !== null}
                            />
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d]">
                            Correo electronico

                            <input
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                              type="email"
                              placeholder="correo@proveedor.com"
                              value={editForm.email}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  email: e.target.value,
                                })
                              }
                              disabled={savingKey !== null}
                            />
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d] sm:col-span-2">
                            Notas

                            <textarea
                              className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                              placeholder="Condiciones, persona de contacto, observaciones..."
                              value={editForm.notes}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  notes: e.target.value,
                                })
                              }
                              disabled={savingKey !== null}
                            />
                          </label>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-[#b4a78d]/20 bg-white/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            onClick={cancelEditing}
                            disabled={savingKey !== null}
                          >
                            Cancelar edicion
                          </button>

                          <button
                            type="submit"
                            className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            disabled={savingKey !== null}
                          >
                            {savingKey === `edit-${supplier.id}`
                              ? "Guardando cambios..."
                              : "Guardar cambios"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {isDeleteConfirmOpen ? (
                      <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3">
                        <div className="text-sm font-black text-red-800">
                          Eliminar proveedor
                        </div>

                        <p className="mt-1 text-sm font-medium text-red-700">
                          Esta accion solo se completara si no tiene compras registradas.
                        </p>

                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            onClick={cancelDelete}
                            disabled={savingKey !== null}
                          >
                            Cancelar
                          </button>

                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                            onClick={() => void deleteSupplier(supplier)}
                            disabled={savingKey !== null}
                          >
                            {savingKey === `delete-${supplier.id}`
                              ? "Eliminando..."
                              : "Confirmar eliminacion"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => startEditing(supplier)}
                        className={`inline-flex w-full items-center justify-center rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isEditing
                            ? "border-[#a7282d]/20 bg-[#a7282d]/8 text-[#861f23]"
                            : "border-black/10 bg-white text-[#201f1d] hover:border-[#b4a78d]/50 hover:bg-[#f7f4ee]"
                        }`}
                        disabled={savingKey !== null}
                      >
                        {isEditing ? "Editando" : "Editar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void toggleSupplierStatus(supplier)}
                        className={`inline-flex w-full items-center justify-center rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          supplier.active
                            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        disabled={savingKey !== null}
                      >
                        {savingKey === `status-${supplier.id}`
                          ? supplier.active
                            ? "Desactivando..."
                            : "Activando..."
                          : supplier.active
                            ? "Desactivar"
                            : "Activar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => requestDelete(supplier)}
                        className={`inline-flex w-full items-center justify-center rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isDeleteConfirmOpen
                            ? "border-red-300 bg-red-100 text-red-800"
                            : "border-red-200 bg-white text-red-700 hover:bg-red-50"
                        }`}
                        disabled={savingKey !== null}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
