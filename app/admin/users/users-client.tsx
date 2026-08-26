"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

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
  const [success, setSuccess] = useState("");
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
    setError("");
    setSuccess("");

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
      setError(err.error || "Error creando usuario");
      return;
    }

    setForm(createInitialForm());
    await loadUsers();
  }

  async function saveUser(userId: number) {
    const draft = editing[userId];
    if (!draft) return;

    setSavingId(userId);
    setError("");
    setSuccess("");

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
      setError(err.error || "Error actualizando usuario");
      return;
    }

    await loadUsers();
  }

  async function resetPassword(userId: number) {
    const password = prompt(
      "Introduce la nueva contraseña. Debe tener al menos 8 caracteres:"
    );

    if (!password) return;

    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
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
      setError(err.error || "Error reseteando contraseña");
      return;
    }

    setSuccess("Contraseña actualizada correctamente.");
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        title="Usuarios internos"
        description="Gestiona cuentas de acceso, roles administrativos y vínculos con socios del club."
      />

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            Error de administración
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
              Administración de acceso
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Crear usuario
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
            Crea una cuenta interna, asigna su rol y, si procede, vincúlala con un socio.
          </p>
        </div>

        <form
          onSubmit={createUser}
          className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3"
        >
          <label className="block text-sm font-bold text-[#201f1d]">
            Nombre

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Nombre del usuario"
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
            Correo electrónico

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="email"
              placeholder="usuario@club.com"
              autoComplete="username"
              value={form.email}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Contraseña inicial

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) =>
                setForm({
                  ...form,
                  password: e.target.value,
                })
              }
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Rol

            <select
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as UserRole,
                })
              }
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>

          <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
            Socio vinculado

            <select
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              value={form.memberId}
              onChange={(e) =>
                setForm({
                  ...form,
                  memberId: e.target.value,
                })
              }
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

            <span className="mt-2 block text-xs font-normal app-muted">
              Un socio ya vinculado a otra cuenta no puede seleccionarse.
            </span>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-50 xl:w-auto"
            >
              {loading ? "Creando usuario..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Control de acceso
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Usuarios internos
              </h2>

              <p className="mt-1 text-sm app-muted">
                Revisa cuentas, roles, estado y vínculos con socios.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-2xl border border-black/8 bg-[#f7f4ee] px-4 py-3">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] app-muted">
                  Usuarios
                </div>

                <div className="mt-1 text-lg font-black tabular-nums text-[#201f1d]">
                  {users.length}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-amber-800/70">
                  Admin activos
                </div>

                <div className="mt-1 text-lg font-black tabular-nums text-amber-800">
                  {activeAdmins}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {users.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-7 text-center">
              <div className="font-black text-[#201f1d]">
                No hay usuarios creados
              </div>

              <p className="mt-2 text-sm app-muted">
                Crea la primera cuenta interna desde el formulario superior.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {users.map((user, index) => {
                const draft = editing[user.id];

                if (!draft) return null;

                const isAdmin = user.role === "ADMIN";
                const isActive = user.active;

                return (
                  <article
                    key={user.id}
                    className="overflow-hidden rounded-[1.75rem] border border-black/8 bg-white/88 transition-all hover:border-[#b4a78d]/40 hover:shadow-[0_10px_28px_rgba(22,20,18,0.05)]"
                  >
                    <div className="border-b border-black/7 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="min-w-0">
                            <h3 className="break-words text-lg font-black tracking-[-0.02em] text-[#201f1d]">
                              {user.name}
                            </h3>

                            <div className="mt-1 break-all text-sm app-muted">
                              {user.email}
                            </div>

                            <div className="mt-2 text-xs app-muted">
                              Creado:{" "}
                              {new Date(user.createdAt).toLocaleString("es-ES")}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${
                              isAdmin
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]"
                            }`}
                          >
                            {isAdmin ? "ADMIN" : "STAFF"}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${
                              isActive
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-red-200 bg-red-50 text-red-700"
                            }`}
                          >
                            {isActive ? "ACTIVO" : "INACTIVO"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                          <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                            Rol actual
                          </div>

                          <div className="mt-2 font-black text-[#201f1d]">
                            {isAdmin ? "Administrador" : "Staff"}
                          </div>
                        </div>

                        <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                          <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                            Socio vinculado
                          </div>

                          <div className="mt-2 text-sm font-black text-[#201f1d]">
                            {user.member
                              ? user.member.fullName
                              : "Sin socio vinculado"}
                          </div>

                          {user.member ? (
                            <div className="mt-1 text-xs app-muted">
                              DNI {user.member.dni}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee]/65">
                        <div className="border-b border-black/7 px-4 py-3">
                          <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] app-muted">
                            Configuración de cuenta
                          </div>
                        </div>

                        {!draft.active ? (
                          <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3">
                            <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-red-700">
                              Acceso desactivado
                            </div>

                            <p className="mt-1 text-sm leading-6 text-red-700">
                              Este usuario no podrá iniciar sesión cuando guardes los cambios.
                            </p>
                          </div>
                        ) : null}

                        {user.role === "ADMIN" && draft.role === "STAFF" ? (
                          <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-amber-800">
                              Cambio de permisos
                            </div>

                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              Al guardar, esta cuenta dejará de tener permisos de administrador.
                            </p>
                          </div>
                        ) : null}

                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                          <label className="block min-w-0 text-sm font-bold text-[#201f1d]">
                            Nombre

                            <input
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                              value={draft.name}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [user.id]: {
                                    ...draft,
                                    name: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d]">
                            Correo electrónico

                            <input
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                              type="email"
                              value={draft.email}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [user.id]: {
                                    ...draft,
                                    email: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d]">
                            Rol

                            <select
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
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
                              <option value="STAFF">Staff</option>
                              <option value="ADMIN">Administrador</option>
                            </select>
                          </label>

                          <label className="block text-sm font-bold text-[#201f1d]">
                            Socio vinculado

                            <select
                              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                              value={draft.memberId}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [user.id]: {
                                    ...draft,
                                    memberId: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">Sin socio vinculado</option>

                              {members.map((member) => {
                                const linkedToAnotherUser =
                                  Boolean(member.appUser) &&
                                  member.appUser?.id !== user.id;

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
                          </label>

                          <label className="flex min-h-[72px] items-center gap-3 rounded-[1.25rem] border border-black/8 bg-white px-4 py-3 sm:col-span-2">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  [user.id]: {
                                    ...draft,
                                    active: e.target.checked,
                                  },
                                })
                              }
                              className="h-4 w-4 accent-[#a7282d]"
                            />

                            <div>
                              <div className="text-sm font-black text-[#201f1d]">
                                {draft.active ? "Usuario activo" : "Usuario inactivo"}
                              </div>

                              <div className="mt-0.5 text-xs app-muted">
                                {draft.active
                                  ? "La cuenta puede iniciar sesión y utilizar la aplicación."
                                  : "La cuenta quedará sin acceso al guardar los cambios."}
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 border-t border-black/7 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            void resetPassword(user.id);
                          }}
                          disabled={savingId === user.id}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#b4a78d]/35 bg-[#f7f4ee] px-4 py-2.5 text-sm font-bold text-[#645b4c] transition hover:bg-[#f0ece4] disabled:opacity-50 sm:w-auto"
                        >
                          Cambiar contraseña
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void saveUser(user.id);
                          }}
                          disabled={savingId === user.id}
                          className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 sm:w-auto ${
                            !draft.active || (user.role === "ADMIN" && draft.role === "STAFF")
                              ? "app-button-danger"
                              : "app-button-primary"
                          }`}
                        >
                          {savingId === user.id
                            ? "Guardando..."
                            : "Guardar cambios"}
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
