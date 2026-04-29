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

  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Socios</h1>

      <form onSubmit={handleSubmit} className="mb-6 grid gap-2 rounded border p-4">
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
        {members.map((member) => {
          const expired =
            Boolean(member.expiresAt) &&
            new Date(member.expiresAt as string) < new Date();

          return (
            <Link key={member.id} href={`/members/${member.id}`}>
              <div className="cursor-pointer rounded border p-3 hover:bg-gray-50">
                <div className="font-medium">{member.fullName}</div>
                <div className="text-sm text-gray-500">
                  {member.dni}
                  {member.phone ? ` · ${member.phone}` : ""}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {member.active ? "Activo" : "Inactivo"}
                  {expired ? " · Caducado" : ""}
                  {member.expiresAt
                    ? ` · Caduca ${new Date(member.expiresAt).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
