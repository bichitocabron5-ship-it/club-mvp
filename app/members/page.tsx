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
    <main>
      <h1 className="mb-4 text-2xl font-bold">Socios</h1>

      <Link
        href="/members/new"
        className="mb-4 inline-block rounded bg-blue-600 px-4 py-2 text-white"
      >
        Alta de socio
      </Link>

      <form onSubmit={handleSubmit} className="mb-6 grid gap-2 rounded border p-4">
        <input
          className="w-full rounded border p-3"
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
              className={`rounded px-4 py-2 text-sm font-bold ${
                filter === f.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className="border p-2"
          placeholder="Nombre completo"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />

        <input
          className="border p-2"
          placeholder="DNI"
          value={form.dni}
          onChange={(e) => setForm({ ...form, dni: e.target.value })}
          required
        />

        <input
          className="border p-2"
          placeholder="Telefono"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Socio activo
        </label>

        <input
          className="border p-2"
          type="date"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />

        <button className="bg-blue-600 px-4 py-2 text-white">Crear socio</button>
      </form>

      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const expired =
            Boolean(member.expiresAt) &&
            new Date(member.expiresAt as string) < new Date();

          return (
            <Link key={member.id} href={`/members/${member.id}`}>
              <div className="cursor-pointer rounded border p-3 hover:bg-gray-50">
                <div className="font-medium">{member.fullName}</div>
                <div className="text-sm text-gray-500">
                  Nº {member.memberNumber ?? member.id} · {member.dni}
                  {member.phone ? ` · ${member.phone}` : ""}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {member.active ? "Activo" : "Inactivo"}
                  {expired ? " · Caducado" : ""}
                  {member.expiresAt
                    ? ` · Caduca ${new Date(member.expiresAt).toLocaleDateString()}`
                    : ""}
                </div>
                <div className="flex items-center justify-between border p-3 rounded">
                  <div>
                    <div className="font-semibold">{member.fullName}</div>
                    <div className="text-sm text-gray-500">{member.dni}</div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {member.active ? (
                      <span className="rounded bg-green-100 px-2 py-1 text-green-700">
                        ACTIVO
                      </span>
                    ) : (
                      <span className="rounded bg-red-100 px-2 py-1 text-red-700">
                        BLOQUEADO
                      </span>
                    )}

                    {member.expiresAt && new Date(member.expiresAt) < new Date() && (
                      <span className="rounded bg-red-100 px-2 py-1 text-red-700">
                        CADUCADO
                      </span>
                    )}

                    {!member.hasContract && (
                      <span className="rounded bg-yellow-100 px-2 py-1 text-yellow-700">
                        SIN CONTRATO
                      </span>
                    )}

                    {member.rfidCode && (
                      <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">
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
