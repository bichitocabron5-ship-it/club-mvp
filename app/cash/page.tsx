// app/cash/page.tsx
"use client";

import type { CashMove, DayClosure } from "@/lib/types";
import { useEffect, useState } from "react";

type ClosureResponse = {
  closed: boolean;
  closure: DayClosure | null;
};

export default function CashPage() {
  const [moves, setMoves] = useState<CashMove[]>([]);
  const [closure, setClosure] = useState<DayClosure | null>(null);
  const [closed, setClosed] = useState(false);
  const [note, setNote] = useState("");
  const [countedCash, setCountedCash] = useState("");

  async function loadCash() {
    const [movesRes, closureRes] = await Promise.all([
      fetch("/api/cash"),
      fetch("/api/day-closure"),
    ]);

    const movesData: CashMove[] = await movesRes.json();
    const closureData: ClosureResponse = await closureRes.json();

    setMoves(movesData);
    setClosed(closureData.closed);
    setClosure(closureData.closure);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCash();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  const todayMoves = moves.filter((move) => {
    const date = new Date(move.createdAt);
    const now = new Date();

    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  });

  const income = todayMoves
    .filter((move) => move.type === "income")
    .reduce((acc, move) => acc + Number(move.amount), 0);

  const expense = todayMoves
    .filter((move) => move.type === "expense")
    .reduce((acc, move) => acc + Number(move.amount), 0);

  const balance = income - expense;
  const counted = Number(countedCash || 0);
  const difference = counted - balance;

  async function closeDay() {
    const ok = confirm("Cerrar el día? No se podrán registrar más retiradas hoy.");
    if (!ok) return;

    const res = await fetch("/api/day-closure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countedCash: counted,
        note,
      }),
    });

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "Error al cerrar el día");
      return;
    }

    setNote("");
    setCountedCash("");
    await loadCash();
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Caja</h1>
        <p className="mt-2 text-sm app-muted">
          Cierre diario y movimientos con mejor lectura en móvil y escritorio.
        </p>
      </div>

      {closed && (
        <div className="mb-4 rounded-3xl bg-green-100 p-4 text-green-700">
          <div className="font-bold">Día cerrado</div>
          <div>
            Esperado:{" "}
            <strong>{Number(closure?.expectedCash || 0).toFixed(2)} EUR</strong>
          </div>
          <div>
            Contado:{" "}
            <strong>{Number(closure?.countedCash || 0).toFixed(2)} EUR</strong>
          </div>
          <div>
            Diferencia:{" "}
            <strong
              className={
                Number(closure?.difference || 0) === 0
                  ? "text-green-700"
                  : "text-red-700"
              }
            >
              {Number(closure?.difference || 0).toFixed(2)} EUR
            </strong>
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-3 text-center sm:grid-cols-3">
        <div className="app-panel rounded-3xl p-3">
          <div className="text-sm text-gray-500">Ingresos</div>
          <strong>{income.toFixed(2)} EUR</strong>
        </div>
        <div className="app-panel rounded-3xl p-3">
          <div className="text-sm text-gray-500">Gastos</div>
          <strong>{expense.toFixed(2)} EUR</strong>
        </div>
        <div className="app-panel rounded-3xl p-3">
          <div className="text-sm text-gray-500">Esperado</div>
          <strong>{balance.toFixed(2)} EUR</strong>
        </div>
      </div>

      {!closed && (
        <div className="app-panel mb-6 rounded-3xl p-4">
          <div className="mb-3 rounded-2xl bg-gray-50 p-3 text-sm">
            <div>
              Efectivo esperado: <strong>{balance.toFixed(2)} EUR</strong>
            </div>
            <div>
              Diferencia actual:{" "}
              <strong className={difference === 0 ? "text-green-700" : "text-red-700"}>
                {difference.toFixed(2)} EUR
              </strong>
            </div>
          </div>

          <input
            className="mb-2 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            type="number"
            step="0.01"
            placeholder="Efectivo contado"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
          />

          <input
            className="mb-2 w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Nota de cierre opcional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button
            onClick={closeDay}
            className="app-button-danger w-full rounded-2xl p-3 font-bold text-white"
          >
            Cerrar día
          </button>
        </div>
      )}

      <h2 className="mb-2 font-semibold">Movimientos de hoy</h2>

      <div className="space-y-3">
        {todayMoves.map((move) => (
          <div key={move.id} className="app-panel flex flex-col gap-2 rounded-3xl p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm text-gray-600">
                {new Date(move.createdAt).toLocaleString()}
              </div>
              <div>{move.note}</div>
            </div>

            <div
              className={
                move.type === "income" ? "text-green-600" : "text-red-600"
              }
            >
              {move.type === "income" ? "+" : "-"}
              {Number(move.amount).toFixed(2)} EUR
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
