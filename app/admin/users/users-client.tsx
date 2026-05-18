"use client";

import { useEffect, useMemo, useState } from "react";

type UserRole = "ADMIN" | "STAFF";

type AppUserRecord = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  memberId: number | null;
  member: {
    id: number;
    fullName: string;
    dni: string;
  } | null;
};

type MemberOption = {
  id: number;
  fullName: string;
  dni: string;
  appUser: {
    id: number;
    name: string;
  } | null;
};

type EditableUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  memberId: string;
};

const createInitialForm = () => ({
  name: "",
  email: "",
  password: "",
  role: "STAFF" as UserRole,
  memberId: "",
});

export function AdminUsersClient() {
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(createInitialForm);
  const [editing, setEditing] = useState<Record<number, EditableUser>>({});

  async function loadUsers() {
    const [usersRes, optionsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/users/options"),
    ]);

    if (!usersRes.ok || !optionsRes.ok) {
      setError("No autorizado o error cargando usuarios");
      return;
    }

    const usersData: AppUserRecord[] = await usersRes.json();
    const membersData: MemberOption[] = await optionsRes.json();

    setUsers(usersData);
    setMembers(membersData);
    setEditing(
      Object.fromEntries(
        usersData.map((user) => [
          user.id,
          {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            active: user.active,
            memberId: user.memberId ? String(user.memberId) : "",
          },
        ])
      )
    );
    setError("");
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const activeAdmins = useMemo(
    () => users.filter((user) => user.active && user.role === "ADMIN").length,
    [users]
  );

  function getMemberLabel(member: MemberOption) {
    const linkLabel = member.appUser
      ? ` · vinculado a ${member.appUser.name}`
      : "";
    return `${member.fullName} · ${member.dni}${linkLabel}`;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        memberId: form.memberId ? Number(form.memberId) : null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "Error creando usuario");
      return;
    }

    setForm(createInitialForm());
    await loadUsers();
  }

  async function saveUser(userId: number) {
    const draft = editing[userId];
    if (!draft) return;

    setSavingId(userId);

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name,
        email: draft.email,
        role: draft.role,
        active: draft.active,
        memberId: draft.memberId ? Number(draft.memberId) : null,
      }),
    });

    setSavingId(null);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
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

    setSavingId(userId);

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    setSavingId(null);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "Error reseteando contraseña");
      return;
    }

    alert("Contraseña actualizada");
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Usuarios internos</h1>
        <p className="text-sm text-gray-500">
          Gestión de cuentas STAFF y ADMIN, acceso y vínculo opcional con socios.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={createUser} className="mb-6 grid gap-3 rounded border p-4 lg:grid-cols-5">
        <div className="lg:col-span-5">
          <h2 className="text-lg font-bold">Crear usuario</h2>
        </div>

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
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        >
          <option value="STAFF">STAFF</option>
          <option value="ADMIN">ADMIN</option>
        </select>

        <select
          className="rounded border p-3"
          value={form.memberId}
          onChange={(e) => setForm({ ...form, memberId: e.target.value })}
        >
          <option value="">Sin socio vinculado</option>
          {members.map((member) => (
            <option
              key={member.id}
              value={member.id}
              disabled={Boolean(member.appUser)}
            >
              {getMemberLabel(member)}
            </option>
          ))}
        </select>

        <button
          disabled={loading}
          className="rounded bg-blue-600 p-3 font-bold text-white disabled:opacity-40 lg:col-span-5"
        >
          {loading ? "Creando..." : "Crear usuario"}
        </button>
      </form>

      <section className="rounded border p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Usuarios</h2>
            <p className="text-sm text-gray-500">
              ADMIN activos: <strong>{activeAdmins}</strong>
            </p>
          </div>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-500">No hay usuarios creados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Socio vinculado</th>
                  <th className="px-3 py-2">Creado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const draft = editing[user.id];

                  if (!draft) return null;

                  return (
                    <tr key={user.id} className="border-b align-top">
                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <input
                            className="rounded border p-2"
                            value={draft.name}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [user.id]: { ...draft, name: e.target.value },
                              })
                            }
                          />

                          <input
                            className="rounded border p-2"
                            type="email"
                            value={draft.email}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [user.id]: { ...draft, email: e.target.value },
                              })
                            }
                          />
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <span
                            className={
                              user.role === "ADMIN"
                                ? "inline-flex rounded bg-amber-100 px-3 py-1 font-bold text-amber-800"
                                : "inline-flex rounded bg-blue-100 px-3 py-1 font-bold text-blue-700"
                            }
                          >
                            {user.role}
                          </span>

                          <select
                            className="rounded border p-2"
                            value={draft.role}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [user.id]: {
                                  ...draft,
                                  role: e.target.value as UserRole,
                                },
                              })
                            }
                          >
                            <option value="STAFF">STAFF</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <span
                            className={
                              user.active
                                ? "inline-flex rounded bg-green-100 px-3 py-1 font-bold text-green-700"
                                : "inline-flex rounded bg-red-100 px-3 py-1 font-bold text-red-700"
                            }
                          >
                            {user.active ? "ACTIVE" : "INACTIVE"}
                          </span>

                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [user.id]: { ...draft, active: e.target.checked },
                                })
                              }
                            />
                            Activo
                          </label>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="grid gap-2">
                          <div className="text-gray-700">
                            {user.member
                              ? `${user.member.fullName} · ${user.member.dni}`
                              : "Sin socio"}
                          </div>

                          <select
                            className="rounded border p-2"
                            value={draft.memberId}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                [user.id]: { ...draft, memberId: e.target.value },
                              })
                            }
                          >
                            <option value="">Sin socio vinculado</option>
                            {members.map((member) => {
                              const linkedToAnotherUser =
                                Boolean(member.appUser) && member.appUser?.id !== user.id;

                              return (
                                <option
                                  key={member.id}
                                  value={member.id}
                                  disabled={linkedToAnotherUser}
                                >
                                  {getMemberLabel(member)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-gray-500">
                        {new Date(user.createdAt).toLocaleString()}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void saveUser(user.id);
                            }}
                            disabled={savingId === user.id}
                            className="rounded bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-40"
                          >
                            Guardar
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void resetPassword(user.id);
                            }}
                            disabled={savingId === user.id}
                            className="rounded bg-gray-900 px-3 py-2 font-bold text-white disabled:opacity-40"
                          >
                            Reset password
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
