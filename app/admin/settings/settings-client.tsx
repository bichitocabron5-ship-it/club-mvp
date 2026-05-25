"use client";

import { useEffect, useState } from "react";

import type { ClubSettingsRecord } from "@/lib/types";

const emptyForm = {
  dailyLimitG: "10",
  dailyLimitUd: "15",
  defaultMonthlyLimitG: "30",
};

export function AdminSettingsClient() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);

    const res = await fetch("/api/admin/settings", {
      cache: "no-store",
    });

    setLoading(false);

    if (!res.ok) {
      setError("No se pudieron cargar los limites");
      return;
    }

    const data: ClubSettingsRecord = await res.json();
    setForm({
      dailyLimitG: String(data.dailyLimitG),
      dailyLimitUd: String(data.dailyLimitUd),
      defaultMonthlyLimitG: String(data.defaultMonthlyLimitG),
    });
    setError("");
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dailyLimitG: Number(form.dailyLimitG),
        dailyLimitUd: Number(form.dailyLimitUd),
        defaultMonthlyLimitG: Number(form.defaultMonthlyLimitG),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "No se pudieron guardar los limites");
      return;
    }

    await loadSettings();
    alert("Limites guardados");
  }

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Limites del club</h1>
        <p className="text-sm text-gray-500">
          Ajusta los topes diarios del TPV y el valor mensual por defecto para nuevos contratos.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={saveSettings} className="rounded border p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Limite diario gramos</span>
            <input
              className="rounded border p-3"
              type="number"
              step="0.01"
              min="0.01"
              value={form.dailyLimitG}
              onChange={(e) => setForm({ ...form, dailyLimitG: e.target.value })}
              disabled={loading || saving}
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Limite diario unidades</span>
            <input
              className="rounded border p-3"
              type="number"
              step="1"
              min="1"
              value={form.dailyLimitUd}
              onChange={(e) => setForm({ ...form, dailyLimitUd: e.target.value })}
              disabled={loading || saving}
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Mensual por defecto</span>
            <input
              className="rounded border p-3"
              type="number"
              step="1"
              min="1"
              value={form.defaultMonthlyLimitG}
              onChange={(e) =>
                setForm({ ...form, defaultMonthlyLimitG: e.target.value })
              }
              disabled={loading || saving}
              required
            />
          </label>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          El limite mensual real se guarda por contrato de socio. Este valor solo se usa como
          relleno inicial al firmar contratos nuevos.
        </div>

        <button
          className="mt-4 rounded bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-40"
          disabled={loading || saving}
        >
          {saving ? "Guardando..." : "Guardar limites"}
        </button>
      </form>
    </main>
  );
}
