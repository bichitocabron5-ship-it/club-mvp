// app/members/page.tsx
"use client";

import type { MemberSummary } from "@/lib/types";
import { normalizeMemberIdentity } from "@/lib/member-identity";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type MemberForm = {
  fullName: string;
  dni: string;
  phone: string;
  active: boolean;
  expiresAt: string;
};

type MemberFilter = "ALL" | "ACTIVE" | "EXPIRED" | "BLOCKED" | "NO_CONTRACT";

const initialForm: MemberForm = {
  fullName: "",
  dni: "",
  phone: "",
  active: true,
  expiresAt: "",
};

export default function MembersPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [form, setForm] = useState<MemberForm>(initialForm);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("ALL");

  async function loadMembers() {
    const res = await fetch("/api/members");
    const data: MemberSummary[] = await res.json();
    setMembers(data);
  }

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/members")
      .then((res) => res.json())
      .then((data: MemberSummary[]) => {
        if (!cancelled) {
          setMembers(data);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    await fetch("/api/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setForm(initialForm);
    await loadMembers();
  }

  const filteredMembers = members.filter((m) => {
    const query = search.toLowerCase();
    const identityQuery = normalizeMemberIdentity(search);

    const matchesSearch =
      m.fullName.toLowerCase().includes(query) ||
      (identityQuery
        ? normalizeMemberIdentity(m.dni).includes(identityQuery)
        : false) ||
      String(m.memberNumber ?? "").toLowerCase().includes(query);

    const now = new Date();

    const isExpired = m.expiresAt && new Date(m.expiresAt) < now;
    const isBlocked = !m.active;
    const hasContract = m.hasContract;

    let matchesFilter = true;

    if (filter === "ACTIVE") {
      matchesFilter = m.active && !isExpired;
    } else if (filter === "EXPIRED") {
      matchesFilter = !!isExpired;
    } else if (filter === "BLOCKED") {
      matchesFilter = isBlocked;
    } else if (filter === "NO_CONTRACT") {
      matchesFilter = !hasContract;
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="Socios"
          description="Búsqueda, control de estado y gestión de expedientes del club."
        />

        <Link
          href="/members/new"
          className="app-button-primary inline-flex shrink-0 items-center justify-center rounded-full px-5 py-3 text-sm font-bold"
        >
          + Alta de socio
        </Link>
      </div>

      <section className="app-panel mb-5 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Censo
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Buscar socios
              </h2>

              <p className="mt-1 text-sm app-muted">
                Busca por número de socio, nombre o documento de identidad.
              </p>
            </div>

            <div className="rounded-2xl border border-[#b4a78d]/30 bg-[#f3f0e9] px-4 py-2.5">
              <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] app-muted">
                Resultados
              </div>

              <div className="mt-0.5 text-lg font-black tabular-nums text-[#201f1d]">
                {filteredMembers.length}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div>
            <label className="block text-sm font-bold text-[#201f1d]">
              Buscar
            </label>

            <div className="relative mt-2">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pl-11 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                placeholder="Número, nombre o DNI"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#8b857c]"
              >
                ⌕
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
              Filtrar por estado
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { key: "ALL", label: "Todos" },
                { key: "ACTIVE", label: "Activos" },
                { key: "EXPIRED", label: "Caducados" },
                { key: "BLOCKED", label: "Bloqueados" },
                { key: "NO_CONTRACT", label: "Sin contrato" },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key as MemberFilter)}
                  className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                    filter === f.key
                      ? "border-[#a7282d] bg-[#a7282d] text-white shadow-sm"
                      : "border-black/10 bg-white text-[#5f5a53] hover:border-[#b4a78d]/60 hover:bg-[#f7f4ee]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
              Alta rápida
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Crear socio
          </h2>

          <p className="mt-1 text-sm app-muted">
            Registra los datos esenciales. Para completar el expediente utiliza el alta completa.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2 xl:grid-cols-4"
        >
          <label className="block text-sm font-bold text-[#201f1d] xl:col-span-2">
            Nombre completo

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Nombre y apellidos"
              value={form.fullName}
              onChange={(e) =>
                setForm({
                  ...form,
                  fullName: e.target.value,
                })
              }
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            DNI / documento

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Documento"
              value={form.dni}
              onChange={(e) =>
                setForm({
                  ...form,
                  dni: e.target.value,
                })
              }
              required
            />
          </label>

          <label className="block text-sm font-bold text-[#201f1d]">
            Teléfono

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
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
            Caducidad

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="date"
              value={form.expiresAt}
              onChange={(e) =>
                setForm({
                  ...form,
                  expiresAt: e.target.value,
                })
              }
            />
          </label>

          <label className="flex min-h-[74px] items-center gap-3 rounded-[1.25rem] border border-black/8 bg-[#f7f4ee]/70 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm({
                  ...form,
                  active: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[#a7282d]"
            />

            <div>
              <div className="text-sm font-black text-[#201f1d]">
                Socio activo
              </div>

              <div className="mt-0.5 text-xs app-muted">
                Permitir operativa normal.
              </div>
            </div>
          </label>

          <div className="flex items-end lg:col-span-2 xl:col-span-2">
            <button
              type="submit"
              className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3.5 font-bold sm:w-auto"
            >
              Crear socio
            </button>
          </div>
        </form>
      </section>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-[-0.02em] text-[#201f1d]">
            Resultados
          </h2>

          <p className="mt-1 text-sm app-muted">
            {filteredMembers.length === members.length
              ? `${members.length} socio${members.length === 1 ? "" : "s"} registrado${
                  members.length === 1 ? "" : "s"
                }`
              : `${filteredMembers.length} de ${members.length} socios`}
          </p>
        </div>

        {(search || filter !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("ALL");
            }}
            className="app-button-secondary w-full rounded-full px-4 py-2 text-sm font-bold sm:w-auto"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filteredMembers.length === 0 ? (
        <div className="app-panel rounded-[2rem] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f0e9] text-xl font-black text-[#a7282d]">
            ?
          </div>

          <h3 className="mt-4 text-lg font-black text-[#201f1d]">
            No se han encontrado socios
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 app-muted">
            Prueba con otro nombre, DNI o número de socio, o cambia los filtros
            seleccionados.
          </p>

          {(search || filter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("ALL");
              }}
              className="app-button-primary mt-5 rounded-full px-5 py-2.5 text-sm font-bold"
            >
              Mostrar todos
            </button>
          )}
        </div>
      ) : (
        <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Censo del club
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Socios
              </h2>

              <p className="mt-1 text-sm app-muted">
                Consulta el estado y accede al expediente completo de cada socio.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {filteredMembers.length} resultado
              {filteredMembers.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filteredMembers.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-7 text-center">
              <div className="font-black text-[#201f1d]">
                No se han encontrado socios
              </div>

              <p className="mt-2 text-sm app-muted">
                Prueba con otra búsqueda o cambia los filtros seleccionados.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredMembers.map((member) => {
                const expired =
                  Boolean(member.expiresAt) &&
                  new Date(member.expiresAt as string) < new Date();

                const initials =
                  member.fullName
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("") || "?";

                return (
                  <Link
                    key={member.id}
                    href={`/members/${member.id}`}
                    className="group block"
                  >
                    <article className="h-full overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b4a78d]/50 hover:shadow-[0_10px_30px_rgba(22,20,18,0.07)]">
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#0b0b0c] text-base font-black tracking-[-0.03em] text-[#b4a78d]">
                            {initials}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="break-words text-lg font-black tracking-[-0.02em] text-[#201f1d]">
                                  {member.fullName}
                                </h3>

                                <div className="mt-1 text-sm font-bold text-[#861f23]">
                                  Socio Nº {member.memberNumber ?? member.id}
                                </div>
                              </div>

                              <span
                                className={`shrink-0 rounded-full border px-3 py-1 text-[0.68rem] font-black ${
                                  member.active
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-red-200 bg-red-50 text-red-700"
                                }`}
                              >
                                {member.active ? "ACTIVO" : "BLOQUEADO"}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-[#f7f4ee] px-3 py-2.5">
                                <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                                  Documento
                                </div>

                                <div className="mt-1 break-words text-sm font-bold text-[#201f1d]">
                                  {member.dni}
                                </div>
                              </div>

                              <div className="rounded-xl bg-[#f7f4ee] px-3 py-2.5">
                                <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                                  Teléfono
                                </div>

                                <div className="mt-1 break-words text-sm font-bold text-[#201f1d]">
                                  {member.phone || "No indicado"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {expired ? (
                            <span className="app-badge app-badge-danger rounded-full px-3 py-1 text-xs font-bold">
                              CADUCADO
                            </span>
                          ) : member.expiresAt ? (
                            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-xs font-bold text-[#645b4c]">
                              VÁLIDO
                            </span>
                          ) : null}

                          {!member.hasContract ? (
                            <span className="app-badge app-badge-warning rounded-full px-3 py-1 text-xs font-bold">
                              SIN CONTRATO
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                              CONTRATO
                            </span>
                          )}

                          {member.rfidCode ? (
                            <span className="app-badge app-badge-info rounded-full px-3 py-1 text-xs font-bold">
                              RFID
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-col gap-2 border-t border-black/7 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs app-muted">
                            {member.expiresAt ? (
                              <>
                                Caducidad:{" "}
                                <span
                                  className={
                                    expired
                                      ? "font-bold text-red-700"
                                      : "font-bold text-[#201f1d]"
                                  }
                                >
                                  {new Date(
                                    member.expiresAt,
                                  ).toLocaleDateString("es-ES")}
                                </span>
                              </>
                            ) : (
                              "Sin fecha de caducidad"
                            )}
                          </div>

                          <div className="inline-flex items-center gap-1 text-sm font-black text-[#861f23]">
                            Ver expediente
                            <span
                              aria-hidden="true"
                              className="transition-transform group-hover:translate-x-1"
                            >
                              →
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    )}
    </main>
  );
}
