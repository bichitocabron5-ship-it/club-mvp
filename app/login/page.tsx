"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result?.ok) {
        setError("Correo electrónico o contraseña incorrectos.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(
        "No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0b0c] px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-[#a7282d]/18 blur-[130px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[460px] w-[460px] rounded-full bg-[#b4a78d]/10 blur-[150px]" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-[0_40px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden border-r border-white/8 p-10 md:flex">
          <div className="absolute inset-0 bg-gradient-to-br from-[#a7282d]/12 via-transparent to-[#b4a78d]/6" />

          <div className="relative z-10">
            <div className="relative h-24 w-24">
              <Image
                src="/brand/zen-wolves-logo.png"
                alt="The Zen Wolves"
                fill
                priority
                className="object-contain"
                sizes="96px"
              />
            </div>
          </div>

          <div className="relative z-10">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-[#b4a78d]">
              Club Social
            </p>

            <h1 className="max-w-md text-5xl font-black leading-[0.95] tracking-[-0.04em] text-white">
              Gestión privada de
              <span className="block text-[#c43136]">The Zen Wolves</span>
            </h1>

            <p className="mt-6 max-w-sm text-sm leading-6 text-white/50">
              Acceso interno para la gestión operativa del club.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/30">
            <span className="h-px w-10 bg-[#a7282d]" />
            Gestión interna
          </div>
        </section>

        <section className="flex min-h-[620px] items-center bg-[#f3f0e9] p-6 sm:p-10 md:p-12">
          <form onSubmit={handleLogin} className="mx-auto w-full max-w-sm">
            <div className="mb-8 md:hidden">
              <div className="relative h-20 w-20">
                <Image
                  src="/brand/zen-wolves-logo.png"
                  alt="The Zen Wolves"
                  fill
                  priority
                  className="object-contain"
                  sizes="80px"
                />
              </div>
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a7282d]">
              The Zen Wolves
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#201f1d]">
              Acceso al sistema
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#6d6860]">
              Introduce tus credenciales para continuar.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-black"
                >
                  !
                </span>

                <div>
                  <p className="font-bold">No se ha podido iniciar sesión</p>
                  <p className="mt-0.5 text-red-700">{error}</p>
                </div>
              </div>
            )}

            <div className="mt-8">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-bold text-[#201f1d]"
              >
                Correo electrónico
              </label>

              <input
                id="email"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 text-[#201f1d] outline-none placeholder:text-black/30 focus:border-[#a7282d]/50 focus:ring-4 focus:ring-[#a7282d]/10"
                type="email"
                placeholder="correo@ejemplo.com"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);

                  if (error) {
                    setError(null);
                  }
                }}
                required
              />
            </div>

            <div className="mt-5">
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-bold text-[#201f1d]"
              >
                Contraseña
              </label>

              <div className="relative">
                <input
                  id="password"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3.5 pr-24 text-[#201f1d] outline-none placeholder:text-black/30 focus:border-[#a7282d]/50 focus:ring-4 focus:ring-[#a7282d]/10"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);

                    if (error) {
                      setError(null);
                    }
                  }}
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs font-bold text-[#6d6860] hover:bg-black/5 hover:text-[#201f1d]"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-7 w-full rounded-xl bg-gradient-to-r from-[#a7282d] to-[#861f23] px-4 py-3.5 font-bold text-white shadow-[0_12px_28px_rgba(134,31,35,0.25)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(134,31,35,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Iniciando sesión...
                </span>
              ) : (
                "Iniciar sesión"
              )}
            </button>

            <div className="mt-8 border-t border-black/8 pt-5 text-center">
              <p className="text-xs text-[#6d6860]">
                Acceso restringido al personal autorizado
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}