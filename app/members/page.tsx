// app/members/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    dni: "",
    phone: "",
  });

  async function loadMembers() {
    const res = await fetch("/api/members");
    const data = await res.json();
    setMembers(data);
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await fetch("/api/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    setForm({ fullName: "", dni: "", phone: "" });
    loadMembers();
  }

  return (
    <main>
      <h1 className="text-2xl font-bold mb-4">Socios</h1>

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
          placeholder="Teléfono"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <button className="bg-blue-600 text-white px-4 py-2">
          Crear socio
        </button>
      </form>

      <div className="space-y-2">
        {members.map((m) => (
          <Link key={m.id} href={`/members/${m.id}`}>
            <div className="border p-3 rounded hover:bg-gray-50 cursor-pointer">
              <div className="font-medium">{m.fullName}</div>
              <div className="text-sm text-gray-500">
                {m.dni} {m.phone ? `· ${m.phone}` : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}