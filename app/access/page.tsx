// app/access/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type InsideMember = {
  id: number;
  fullName: string;
  dni: string;
  lastAccessAt: string;
};

type CurrentAccess = {
  count: number;
  inside: InsideMember[];
};

export default function AccessPage() {
  const [rfidInput, setRfidInput] = useState("");
  const [error, setError] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [lastMember, setLastMember] = useState("");
  const [lastAction, setLastAction] = useState<"IN" | "OUT" | "">("");
  const [screenStatus, setScreenStatus] = useState<"OK" | "DENIED" | "IDLE">("IDLE");
  const [current, setCurrent] = useState<CurrentAccess>({
    count: 0,
    inside: [],
  });

  const inputRef = useRef<HTMLInputElement | null>(null);

  async function loadCurrent() {
    const res = await fetch("/api/access/current");
    const data: CurrentAccess = await res.json();
    setCurrent(data);
  }

  useEffect(() => {
    inputRef.current?.focus();

    setTimeout(() => {
      void loadCurrent();
    }, 0);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const code = rfidInput.trim();
    if (!code) return;

    setError("");
    setLastMessage("");
    setLastMember("");
    setLastAction("");

    const memberRes = await fetch(
      `/api/members/by-rfid/${encodeURIComponent(code)}`
    );

    if (!memberRes.ok) {
      setError("Chapita no asignada a ningún socio.");
      setScreenStatus("DENIED");
      setRfidInput("");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    const member = await memberRes.json();

    const accessRes = await fetch("/api/access/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId: member.id }),
    });

    if (!accessRes.ok) {
      const err = await accessRes.json();
      setError(err.error || "Error registrando acceso");
      setScreenStatus("DENIED");
      setRfidInput("");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    const result = await accessRes.json();

    setLastMessage(result.message);
    setLastMember(member.fullName);
    setLastAction(result.action);
    setScreenStatus("OK");
    setRfidInput("");

    await loadCurrent();

    setTimeout(() => {
      setScreenStatus("IDLE");
      setError("");
      setLastMessage("");
      setLastMember("");
      setLastAction("");
      inputRef.current?.focus();
    }, 3000);

    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Control de acceso</h1>
        <p className="text-sm text-gray-500">
          Escanea una chapita para registrar entrada o salida.
        </p>
      </div>

      <div
        className={
          screenStatus === "OK"
            ? "mb-6 rounded border-4 border-green-600 bg-green-100 p-8 text-center text-green-800"
            : screenStatus === "DENIED"
              ? "mb-6 rounded border-4 border-red-600 bg-red-100 p-8 text-center text-red-800"
              : "mb-6 rounded border-4 border-gray-300 bg-gray-50 p-8 text-center text-gray-600"
        }
      >
        {screenStatus === "OK" && (
          <>
            <div className="text-5xl font-black">ACCESO PERMITIDO</div>
            <div className="mt-3 text-2xl">{lastMember}</div>
            <div className="mt-2 text-xl">
              {lastAction === "IN" ? "Entrada registrada" : "Salida registrada"}
            </div>
          </>
        )}

        {screenStatus === "DENIED" && (
          <>
            <div className="text-5xl font-black">ACCESO DENEGADO</div>
            <div className="mt-3 text-2xl">{error || "No autorizado"}</div>
          </>
        )}

        {screenStatus === "IDLE" && (
          <>
            <div className="text-4xl font-black">ESPERANDO CHAPITA</div>
            <div className="mt-3 text-lg">Pasa una chapita por el lector RFID</div>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-6 rounded border p-4">
        <label className="mb-2 block text-sm font-medium">
          Escanear chapita
        </label>

        <input
          ref={inputRef}
          autoFocus
          className="w-full rounded border p-4 text-xl"
          placeholder="Pasa la chapita por el lector..."
          value={rfidInput}
          onChange={(e) => setRfidInput(e.target.value)}
          autoComplete="off"
        />

        {error && (
          <div className="mt-3 rounded bg-red-100 p-3 text-red-700">
            {error}
          </div>
        )}

        {lastMessage && (
          <div
            className={
              lastAction === "IN"
                ? "mt-3 rounded bg-green-100 p-4 text-green-800"
                : "mt-3 rounded bg-blue-100 p-4 text-blue-800"
            }
          >
            <div className="text-lg font-bold">{lastMessage}</div>
            <div>{lastMember}</div>
          </div>
        )}
      </form>

      <section className="rounded border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Dentro ahora</h2>
          <div className="rounded bg-gray-900 px-4 py-2 text-white">
            Aforo: <strong>{current.count}</strong>
          </div>
        </div>

        {current.inside.length === 0 && (
          <div className="rounded bg-gray-50 p-3 text-gray-500">
            No hay socios dentro.
          </div>
        )}

        <div className="space-y-2">
          {current.inside.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded border p-3"
            >
              <div>
                <div className="font-semibold">{member.fullName}</div>
                <div className="text-sm text-gray-500">{member.dni}</div>
              </div>

              <div className="text-sm text-gray-500">
                Entrada: {new Date(member.lastAccessAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}