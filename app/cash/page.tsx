// app/cash/page.tsx
"use client";

import { useEffect, useState } from "react";

export default function CashPage() {
  const [moves, setMoves] = useState<any[]>([]);
  const [closure, setClosure] = useState<any>(null);
  const [closed, setClosed] = useState(false);
  const [note, setNote] = useState("");

  async function loadCash() {
    const movesRes = await fetch("/api/cash");
    const movesData = await movesRes.json();
    setMoves(movesData);

    const closureRes = await fetch("/api/day-closure");
    const closureData = await closureRes.json();
    setClosed(closureData.closed);
    setClosure(closureData.closure);
  }

  useEffect(() => {
    loadCash();
  }, []);

  const todayMoves = moves.filter((m) => {
    const d = new Date(m.createdAt);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  const income = todayMoves
    .filter((m) => m.type === "income")
    .reduce((acc, m) => acc + Number(m.amount), 0);

  const expense = todayMoves
    .filter((m) => m.type === "expense")
    .reduce((acc, m) => acc + Number(m.amount), 0);

  const balance = income - expense;

  async function closeDay() {
    const ok = confirm("¿Cerrar el día? No se podrán registrar más retiradas hoy.");
    if (!ok) return;

    const res = await fetch("/api/day-closure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error al cerrar el día");
      return;
    }

    setNote("");
    loadCash();
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Caja</h1>

      {closed && (
        <div className="mb-4 rounded bg-green-100 p-3 text-green-700">
          Día cerrado. Balance:{" "}
          <strong>{Number(closure?.balance || 0).toFixed(2)} €</strong>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Ingresos</div>
          <strong>{income.toFixed(2)} €</strong>
        </div>
        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Gastos</div>
          <strong>{expense.toFixed(2)} €</strong>
        </div>
        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Balance</div>
          <strong>{balance.toFixed(2)} €</strong>
        </div>
      </div>

      {!closed && (
        <div className="mb-6 rounded border p-3">
          <input
            className="mb-2 w-full border p-2"
            placeholder="Nota de cierre opcional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            onClick={closeDay}
            className="w-full bg-red-600 p-2 text-white"
          >
            Cerrar día
          </button>
        </div>
      )}

      <h2 className="mb-2 font-semibold">Movimientos de hoy</h2>

      <div className="space-y-2">
        {todayMoves.map((m) => (
          <div key={m.id} className="flex justify-between rounded border p-3">
            <div>
              <div className="text-sm text-gray-600">
                {new Date(m.createdAt).toLocaleString()}
              </div>
              <div>{m.note}</div>
            </div>

            <div className={m.type === "income" ? "text-green-600" : "text-red-600"}>
              {m.type === "income" ? "+" : "-"}
              {Number(m.amount).toFixed(2)} €
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}