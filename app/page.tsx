"use client";

import { useEffect, useState } from "react";

export default function Home() {
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

  async function handleSubmit(e: any) {
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
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Socios</h1>

      {/* FORM */}
      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <input
          className="border p-2 w-full"
          placeholder="Nombre completo"
          value={form.fullName}
          onChange={(e) =>
            setForm({ ...form, fullName: e.target.value })
          }
          required
        />

        <input
          className="border p-2 w-full"
          placeholder="DNI"
          value={form.dni}
          onChange={(e) =>
            setForm({ ...form, dni: e.target.value })
          }
          required
        />

        <input
          className="border p-2 w-full"
          placeholder="Teléfono"
          value={form.phone}
          onChange={(e) =>
            setForm({ ...form, phone: e.target.value })
          }
        />

        <button className="bg-blue-600 text-white px-4 py-2 w-full">
          Crear socio
        </button>
      </form>

      {/* LISTA */}
      <ul>
        {members.map((m) => (
          <li key={m.id} className="border-b py-2">
            {m.fullName} — {m.dni}
          </li>
        ))}
      </ul>
    </div>
  );
}