// app/admin/users/page.tsx
"use client";

import { useEffect, useState } from "react";

type AppUser = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF" | string;
  active: boolean;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "STAFF",
  });

  async function loadUsers() {
    const res = await fetch("/api/admin/users");

    if (!res.ok) {
      alert("No autorizado o error cargando usuarios");
      return;
    }

    const data: AppUser[] = await res.json();
    setUsers(data);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error creando usuario");
      return;
    }

    setForm({
      name: "",
      email: "",
      password: "",
      role: "STAFF",
    });

    await loadUsers();
  }

  async function updateUser(userId: number, payload: Partial<AppUser> & { password?: string }) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error actualizando usuario");
      return;
    }

    await loadUsers();
  }

  async function resetPassword(userId: number) {
    const password = prompt("Nueva contraseña, mínimo 8 caracteres:");

    if (!password) return;

    if (password.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    await updateUser(userId, { password });
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Usuarios internos</h1>
        <p className="text-sm text-gray-500">
          Gestión de trabajadores, roles y acceso al sistema.
        </p>
      </div>

      <form onSubmit={createUser} className="mb-6 grid gap-3 rounded border p-4">
        <h2 className="text-lg font-bold">Crear usuario</h2>

        <input
          className="rounded border p-3"
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <input
          className="rounded border p-3"
          type="email"
          placeholder="Email"
          autoComplete="username"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />

        <input
          className="rounded border p-3"
          type="password"
          placeholder="Contraseña inicial"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />

        <select
          className="rounded border p-3"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="STAFF">STAFF</option>
          <option value="ADMIN">ADMIN</option>
        </select>

        <button
          disabled={loading}
          className="rounded bg-blue-600 p-3 font-bold text-white disabled:opacity-40"
        >
          {loading ? "Creando..." : "Crear usuario"}
        </button>
      </form>

      <section className="rounded border p-4">
        <h2 className="mb-3 text-lg font-bold">Usuarios</h2>

        {users.length === 0 && (
          <p className="text-sm text-gray-500">No hay usuarios creados.</p>
        )}

        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{user.name}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    Creado el {new Date(user.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={
                      user.role === "ADMIN"
                        ? "rounded bg-purple-100 px-3 py-1 text-sm font-bold text-purple-700"
                        : "rounded bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700"
                    }
                  >
                    {user.role}
                  </span>

                  <span
                    className={
                      user.active
                        ? "rounded bg-green-100 px-3 py-1 text-sm font-bold text-green-700"
                        : "rounded bg-red-100 px-3 py-1 text-sm font-bold text-red-700"
                    }
                  >
                    {user.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateUser(user.id, {
                      active: !user.active,
                    })
                  }
                  className="rounded border px-3 py-2 text-sm font-bold"
                >
                  {user.active ? "Desactivar" : "Activar"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateUser(user.id, {
                      role: user.role === "ADMIN" ? "STAFF" : "ADMIN",
                    })
                  }
                  className="rounded border px-3 py-2 text-sm font-bold"
                >
                  Cambiar a {user.role === "ADMIN" ? "STAFF" : "ADMIN"}
                </button>

                <button
                  type="button"
                  onClick={() => resetPassword(user.id)}
                  className="rounded bg-gray-900 px-3 py-2 text-sm font-bold text-white"
                >
                  Resetear contraseña
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}