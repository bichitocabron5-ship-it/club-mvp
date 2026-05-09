// app/expenses/page.tsx
"use client";

import { useEffect, useState } from "react";

type Expense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  paidMethod: string;
  createdAt: string;
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState({
    category: "GENERAL",
    description: "",
    amount: "",
    paidMethod: "CASH",
  });

  async function loadExpenses() {
    const res = await fetch("/api/expenses");
    const data: Expense[] = await res.json();
    setExpenses(data);
  }

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/expenses")
      .then((res) => res.json())
      .then((data: Expense[]) => {
        if (!cancelled) setExpenses(data);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });

    if (!res.ok) {
      alert("Error creando gasto");
      return;
    }

    setForm({
      category: "GENERAL",
      description: "",
      amount: "",
      paidMethod: "CASH",
    });

    await loadExpenses();
  }

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold">Gastos</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-2 rounded border p-4"
      >
        <select
          className="w-full border p-3"
          value={form.category}
          onChange={(e) =>
            setForm({ ...form, category: e.target.value })
          }
        >
          <option value="GENERAL">General</option>
          <option value="ALQUILER">Alquiler</option>
          <option value="LUZ">Luz</option>
          <option value="AGUA">Agua</option>
          <option value="PROVEEDOR">Proveedor</option>
          <option value="SUELDOS">Sueldos</option>
          <option value="MANTENIMIENTO">Mantenimiento</option>
          <option value="OTROS">Otros</option>
        </select>

        <input
          className="w-full border p-3"
          placeholder="Descripción"
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          required
        />

        <input
          className="w-full border p-3"
          type="number"
          step="0.01"
          placeholder="Importe (€)"
          value={form.amount}
          onChange={(e) =>
            setForm({ ...form, amount: e.target.value })
          }
          required
        />

        <select
          className="w-full border p-3"
          value={form.paidMethod}
          onChange={(e) =>
            setForm({ ...form, paidMethod: e.target.value })
          }
        >
          <option value="CASH">Efectivo</option>
          <option value="BANK">Banco</option>
        </select>

        <button className="w-full bg-red-600 p-3 font-bold text-white">
          Registrar gasto
        </button>
      </form>

      <div className="space-y-2">
        {expenses.map((e) => (
          <div
            key={e.id}
            className="flex justify-between rounded border p-3"
          >
            <div>
              <div className="font-semibold">{e.description}</div>
              <div className="text-sm text-gray-500">
                {e.category} · {e.paidMethod}
              </div>
              <div className="text-xs text-gray-400">
                {new Date(e.createdAt).toLocaleString()}
              </div>
            </div>

            <strong className="text-red-600">
              -{Number(e.amount).toFixed(2)} €
            </strong>
          </div>
        ))}
      </div>
    </main>
  );
}