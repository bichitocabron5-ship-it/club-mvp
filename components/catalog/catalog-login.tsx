"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/catalog/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "No se pudo abrir el kiosko");
      }

      setPassword("");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el kiosko");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl items-center px-4 py-8 md:px-6">
      <section className="app-panel-strong w-full rounded-[2rem] p-6 shadow-2xl md:p-10">
        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-[#31584d]">
            Catalogo kiosko
          </div>
          <h1 className="text-4xl font-black tracking-tight text-[#1f241d] md:text-5xl">
            Acceso rapido para tablet
          </h1>
          <p className="mt-3 max-w-xl text-base text-[#536055] md:text-lg">
            Solo lectura. Sin socios, sin caja, sin ventas y sin acceso al panel interno.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#445146]">Password kiosko</span>
            <input
              className="rounded-[1.4rem] border border-black/10 bg-white/90 px-5 py-4 text-lg outline-none focus:border-[#31584d] focus:ring-4 focus:ring-[#a7c957]/30"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Introduce la clave"
              required
            />
          </label>

          {error ? (
            <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            className="app-button-primary rounded-[1.4rem] px-5 py-4 text-lg font-black disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Abriendo..." : "Entrar al catalogo"}
          </button>
        </form>
      </section>
    </main>
  );
}
