// app/members/page.tsx
"use client";

import type { MemberSummary } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

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

    const matchesSearch =
      m.fullName.toLowerCase().includes(query) ||
      m.dni.toLowerCase().includes(query) ||
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
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Socios</h1>
          <p className="mt-2 text-sm app-muted">
            Búsqueda, filtros y alta rápida sin cambiar el flujo operativo.
          </p>
        </div>

        <Link
          href="/members/new"
          className="app-button-primary inline-flex rounded-full px-5 py-3 text-sm font-bold"
        >
          Alta de socio
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="app-panel mb-6 grid gap-3 rounded-3xl p-4 md:p-5">
        <input
          className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
          placeholder="Buscar por numero, nombre o DNI"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
       
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { key: "ALL", label: "Todos" },
            { key: "ACTIVE", label: "Activos" },
            { key: "EXPIRED", label: "Caducados" },
            { key: "BLOCKED", label: "Bloqueados" },
            { key: "NO_CONTRACT", label: "Sin contrato" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as MemberFilter)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                filter === f.key
                  ? "app-button-primary text-white"
                  : "app-button-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto_auto]">
          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Nombre completo"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="DNI"
            value={form.dni}
            onChange={(e) => setForm({ ...form, dni: e.target.value })}
            required
          />

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Telefono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <label className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Socio activo
          </label>

          <input
            className="rounded-2xl border border-black/10 bg-white/80 p-3"
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </div>

        <button className="app-button-primary w-full rounded-2xl px-4 py-3 font-bold md:w-auto">
          Crear socio
        </button>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">
        {filteredMembers.map((member) => {
          const expired =
            Boolean(member.expiresAt) &&
            new Date(member.expiresAt as string) < new Date();

          return (
            <Link key={member.id} href={`/members/${member.id}`}>
              <div className="app-panel cursor-pointer rounded-3xl p-4 hover:bg-white/90">
                <div className="font-medium">{member.fullName}</div>
                <div className="text-sm app-muted">
                  Nº {member.memberNumber ?? member.id} · {member.dni}
                  {member.phone ? ` · ${member.phone}` : ""}
                </div>
                <div className="mt-1 text-xs app-muted">
                  {member.active ? "Activo" : "Inactivo"}
                  {expired ? " · Caducado" : ""}
                  {member.expiresAt
                    ? ` · Caduca ${new Date(member.expiresAt).toLocaleDateString()}`
                    : ""}
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-black/8 bg-white/72 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold">{member.fullName}</div>
                    <div className="text-sm text-gray-500">{member.dni}</div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {member.active ? (
                      <span className="app-badge app-badge-positive rounded-full px-3 py-1">
                        ACTIVO
                      </span>
                    ) : (
                      <span className="app-badge app-badge-danger rounded-full px-3 py-1">
                        BLOQUEADO
                      </span>
                    )}

                    {member.expiresAt && new Date(member.expiresAt) < new Date() && (
                      <span className="app-badge app-badge-danger rounded-full px-3 py-1">
                        CADUCADO
                      </span>
                    )}

                    {!member.hasContract && (
                      <span className="app-badge app-badge-warning rounded-full px-3 py-1">
                        SIN CONTRATO
                      </span>
                    )}

                    {member.rfidCode && (
                      <span className="app-badge app-badge-info rounded-full px-3 py-1">
                        RFID
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
