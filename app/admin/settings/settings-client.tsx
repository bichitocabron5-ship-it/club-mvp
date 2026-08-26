"use client";

import { useEffect, useState } from "react";

import type { ClubSettingsRecord } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";

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
  const [success, setSuccess] = useState("");

  async function loadSettings() {
    setLoading(true);

    const res = await fetch("/api/admin/settings", {
      cache: "no-store",
    });

    setLoading(false);

    if (!res.ok) {
      setError("No se pudieron cargar los límites.");
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
    setError("");
    setSuccess("");

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

      setError(
        err.error || "No se pudieron guardar los límites."
      );

      return;
    }

    await loadSettings();
    setSuccess("Configuración guardada correctamente.");
  }

  useEffect(() => {
    if (!success) return;

    const timeout = setTimeout(() => {
      setSuccess("");
    }, 4000);

    return () => clearTimeout(timeout);
  }, [success]);

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      <PageHeader
        title="Límites del club"
        description="Configura los límites operativos del TPV y el valor mensual inicial de los contratos."
      />

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            No se pudo cargar la configuración
          </div>

          <div className="mt-1 text-sm font-semibold text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          className="mb-5 flex flex-col gap-3 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-emerald-700">
              Configuración actualizada
            </div>

            <div className="mt-1 text-sm font-semibold text-emerald-700">
              {success}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSuccess("")}
            className="app-button-secondary inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-bold"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mb-5 rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-5 py-4 text-sm font-semibold text-[#645b4c]">
          Cargando configuración del club...
        </div>
      ) : null}

      <section className="app-panel overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

            <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
              Configuración operativa
            </span>
          </div>

          <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Límites de dispensación
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
            Estos valores se aplican como límites generales y como referencia inicial
            para los nuevos contratos.
          </p>
        </div>

        <form onSubmit={saveSettings}>
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-3">
            <label className="block text-sm font-bold text-[#201f1d]">
              Límite diario en gramos

              <div className="relative mt-2">
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-11 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.dailyLimitG}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dailyLimitG: e.target.value,
                    })
                  }
                  disabled={loading || saving}
                  required
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black app-muted">
                  g
                </span>
              </div>

              <span className="mt-2 block text-xs font-normal app-muted">
                Máximo diario permitido por socio en productos medidos en gramos.
              </span>
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              Límite diario en unidades

              <div className="relative mt-2">
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-12 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                  type="number"
                  step="1"
                  min="1"
                  value={form.dailyLimitUd}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dailyLimitUd: e.target.value,
                    })
                  }
                  disabled={loading || saving}
                  required
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-black app-muted">
                  ud.
                </span>
              </div>

              <span className="mt-2 block text-xs font-normal app-muted">
                Máximo diario para productos contabilizados por unidades.
              </span>
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              Límite mensual por defecto

              <div className="relative mt-2">
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-11 text-lg font-black tabular-nums outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:opacity-60"
                  type="number"
                  step="1"
                  min="1"
                  value={form.defaultMonthlyLimitG}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultMonthlyLimitG: e.target.value,
                    })
                  }
                  disabled={loading || saving}
                  required
                />

                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black app-muted">
                  g
                </span>
              </div>

              <span className="mt-2 block text-xs font-normal app-muted">
                Valor inicial que se propondrá al formalizar nuevos contratos.
              </span>
            </label>
          </div>

          <div className="border-t border-black/7 bg-[#f7f4ee]/55 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#6d6860]">
                  Importante
                </div>

                <p className="mt-1 text-sm leading-6 app-muted">
                  El límite mensual definitivo se guarda individualmente en el
                  contrato de cada socio. Este valor solo funciona como propuesta
                  inicial para contratos nuevos.
                </p>
              </div>

              <button
                type="submit"
                className="app-button-primary inline-flex w-full shrink-0 items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={loading || saving}
              >
                {saving ? "Guardando..." : "Guardar límites"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
