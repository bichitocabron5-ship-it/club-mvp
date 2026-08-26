// app/access/page.tsx
"use client";

import { normalizeRfidCode } from "@/lib/rfid";
import type {
  AccessAction,
  AccessCurrentResponse,
  AccessMemberSnapshot,
  AccessToggleResponse,
} from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type ScreenStatus = "OK" | "DENIED" | "IDLE";

type LastAccessScan = {
  member: AccessMemberSnapshot;
  action: AccessAction | "";
  message: string;
  error: string;
  status: Exclude<ScreenStatus, "IDLE">;
  readCode: string;
  scannedAt: string;
};

type AccessErrorResponse = {
  error?: string;
  member?: AccessMemberSnapshot;
};

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;

  return expiry < new Date();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin vencimiento";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin vencimiento";

  return date.toLocaleDateString("es-ES");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getMemberWarnings(member: AccessMemberSnapshot) {
  const warnings: string[] = [];

  if (!member.active) {
    warnings.push("Socio inactivo");
  }

  if (isExpired(member.expiresAt)) {
    warnings.push("Socio caducado");
  }

  return warnings;
}

function AccessMemberCard({ scan }: { scan: LastAccessScan }) {
  const member = scan.member;
  const warnings = getMemberWarnings(member);
  const expired = isExpired(member.expiresAt);
  const displayNumber =
    member.displayNumber ?? member.memberNumber ?? member.id;

  const isDenied = scan.status === "DENIED";
  const isEntry = scan.status === "OK" && scan.action === "IN";

  const resultLabel = isDenied
    ? "ACCESO DENEGADO"
    : isEntry
      ? "ENTRADA REGISTRADA"
      : "SALIDA REGISTRADA";

  const resultDescription = isDenied
    ? scan.error || scan.message || "No se ha podido autorizar el acceso."
    : isEntry
      ? "El socio ha quedado registrado dentro del club."
      : "La salida del socio se ha registrado correctamente.";

  const resultTone = isDenied
    ? "border-red-200 bg-red-50 text-red-800"
    : isEntry
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  const resultDot = isDenied
    ? "bg-red-600"
    : isEntry
      ? "bg-emerald-600"
      : "bg-sky-600";

  return (
    <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
      <div className={`border-b px-5 py-5 sm:px-6 ${resultTone}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full ${resultDot}`}
              />

              <span className="text-[0.68rem] font-black uppercase tracking-[0.18em]">
                Resultado de lectura
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl lg:text-4xl">
              {resultLabel}
            </h2>

            <p className="mt-1 text-sm font-semibold opacity-85 sm:text-base">
              {resultDescription}
            </p>
          </div>

          <div className="shrink-0">
            <span className="inline-flex rounded-full border border-current/20 bg-white/60 px-4 py-2 text-xs font-black">
              {isDenied ? "DENEGADO" : isEntry ? "ENTRADA" : "SALIDA"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="border-b border-black/7 bg-[#f7f4ee] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-black/8 bg-white">
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photoUrl}
                alt={`Foto de ${member.fullName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center px-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ece7dd] text-2xl font-black text-[#645b4c]">
                  {member.fullName.trim().charAt(0).toUpperCase() || "?"}
                </div>

                <div className="mt-3 text-sm font-bold text-[#645b4c]">
                  Sin fotografía
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 text-center">
            <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] app-muted">
              Número de socio
            </div>

            <div className="mt-1 text-2xl font-black tabular-nums text-[#201f1d]">
              {displayNumber}
            </div>
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-6">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-[#a7282d]">
              Socio identificado
            </div>

            <h3 className="mt-1 break-words text-2xl font-black tracking-[-0.03em] text-[#201f1d] sm:text-3xl">
              {member.fullName}
            </h3>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-[1.25rem] border border-black/8 bg-[#f7f4ee]/75 px-4 py-3.5">
              <dt className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                DNI
              </dt>

              <dd className="mt-1 break-all text-base font-black text-[#201f1d]">
                {member.dni}
              </dd>
            </div>

            <div className="rounded-[1.25rem] border border-black/8 bg-[#f7f4ee]/75 px-4 py-3.5">
              <dt className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                Vencimiento
              </dt>

              <dd
                className={`mt-1 text-base font-black ${
                  expired ? "text-red-700" : "text-[#201f1d]"
                }`}
              >
                {formatDate(member.expiresAt)}
              </dd>
            </div>

            <div className="rounded-[1.25rem] border border-black/8 bg-[#f7f4ee]/75 px-4 py-3.5">
              <dt className="text-[0.62rem] font-black uppercase tracking-[0.1em] app-muted">
                Estado
              </dt>

              <dd className="mt-1">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                    member.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {member.active ? "ACTIVO" : "INACTIVO"}
                </span>
              </dd>
            </div>
          </dl>

          {warnings.length > 0 ? (
            <div className="mt-4 rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3.5">
              <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-amber-800">
                Atención
              </div>

              <div className="mt-1 text-sm font-bold text-amber-900">
                {warnings.join(" · ")}
              </div>
            </div>
          ) : null}

          <div className="mt-5 border-t border-black/7 pt-4">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs app-muted">
              <span>
                Lectura:{" "}
                <strong className="font-mono text-[#201f1d]">
                  {scan.readCode}
                </strong>
              </span>

              {scan.scannedAt ? (
                <span>
                  Hora:{" "}
                  <strong className="text-[#201f1d]">
                    {formatTime(scan.scannedAt)}
                  </strong>
                </span>
              ) : null}

              {member.rfidCode ? (
                <span>
                  RFID:{" "}
                  <strong className="font-mono text-[#201f1d]">
                    {member.rfidCode}
                  </strong>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AccessPage() {
  const [rfidInput, setRfidInput] = useState("");
  const [error, setError] = useState("");
  const [lastScan, setLastScan] = useState<LastAccessScan | null>(null);
  const [screenStatus, setScreenStatus] = useState<ScreenStatus>("IDLE");
  const [processing, setProcessing] = useState(false);
  const [autoCheckoutLoading, setAutoCheckoutLoading] = useState(false);
  const [lastReadCode, setLastReadCode] = useState("");
  const [current, setCurrent] = useState<AccessCurrentResponse>({
    count: 0,
    inside: [],
  });
  const [autoCheckoutMessage, setAutoCheckoutMessage] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);

  function focusInput() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function loadCurrent() {
    const res = await fetch("/api/access/current", { cache: "no-store" });
    if (!res.ok) return;

    const data: AccessCurrentResponse = await res.json();
    setCurrent(data);
  }

  useEffect(() => {
    focusInput();

    const timeout = setTimeout(() => {
      void loadCurrent();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (processing) return;

    const code = normalizeRfidCode(rfidInput);
    if (!code) {
      setRfidInput("");
      focusInput();
      return;
    }

    let scannedMember: AccessMemberSnapshot | null = null;

    setError("");
    setAutoCheckoutMessage("");
    setLastScan(null);
    setLastReadCode(code);
    setScreenStatus("IDLE");
    setProcessing(true);

    try {
      const memberRes = await fetch(
        `/api/members/by-rfid/${encodeURIComponent(code)}`,
        { cache: "no-store" }
      );

      if (!memberRes.ok) {
        const err = (await memberRes.json().catch(() => null)) as
          | AccessErrorResponse
          | null;
        setError(err?.error || "Chapita no asignada");
        setScreenStatus("DENIED");
        return;
      }

      scannedMember = (await memberRes.json()) as AccessMemberSnapshot;

      const accessRes = await fetch("/api/access/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberId: scannedMember.id }),
      });
      const payload = (await accessRes.json().catch(() => null)) as
        | (Partial<AccessToggleResponse> & AccessErrorResponse)
        | null;

      if (!accessRes.ok) {
        const deniedMember = payload?.member ?? scannedMember;
        const errorMessage =
          payload?.error || getMemberWarnings(deniedMember)[0] || "Acceso denegado";

        setLastScan({
          member: deniedMember,
          action: "",
          message: "Acceso denegado",
          error: errorMessage,
          status: "DENIED",
          readCode: code,
          scannedAt: new Date().toISOString(),
        });
        setError(errorMessage);
        setScreenStatus("DENIED");
        return;
      }

      if (!payload?.member || !payload.action || !payload.message) {
        throw new Error("Respuesta de acceso invalida");
      }

      setLastScan({
        member: payload.member,
        action: payload.action,
        message: payload.message,
        error: "",
        status: "OK",
        readCode: code,
        scannedAt: new Date().toISOString(),
      });
      setScreenStatus("OK");

      await loadCurrent();
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Error registrando acceso";

      if (scannedMember) {
        setLastScan({
          member: scannedMember,
          action: "",
          message: "Acceso denegado",
          error: message,
          status: "DENIED",
          readCode: code,
          scannedAt: new Date().toISOString(),
        });
      }

      setError(message);
      setScreenStatus("DENIED");
    } finally {
      setRfidInput("");
      setProcessing(false);
      focusInput();
    }
  }

  async function handleAutoCheckout() {
    if (autoCheckoutLoading || current.count === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Hay ${current.count} socio${current.count === 1 ? "" : "s"} dentro. Se registrará la salida automática de todos. ¿Quieres continuar?`
    );

    if (!confirmed) {
      focusInput();
      return;
    }

    setAutoCheckoutLoading(true);
    setError("");
    setAutoCheckoutMessage("");

    try {
      const res = await fetch("/api/access/auto-checkout", {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; count?: number }
        | null;

      if (!res.ok) {
        throw new Error(data?.error || "Error registrando salida automática");
      }

      const count = Number(data?.count || 0);
      setAutoCheckoutMessage(
        `Se registró la salida automática de ${count} socio${count === 1 ? "" : "s"}.`
      );
      await loadCurrent();
    } catch (autoCheckoutError) {
      setError(
        autoCheckoutError instanceof Error
          ? autoCheckoutError.message
          : "Error registrando la salida automática"
      );
    } finally {
      setAutoCheckoutLoading(false);
      focusInput();
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        title="Control de acceso"
        description="Registra entradas y salidas mediante la chapita RFID del socio."
      />

      {lastScan ? (
        <AccessMemberCard scan={lastScan} />
      ) : screenStatus === "DENIED" ? (
        <section className="mb-6 overflow-hidden rounded-[2rem] border border-red-200 bg-white/88">
          <div className="border-b border-red-200 bg-red-50 px-5 py-6 text-center sm:px-6 sm:py-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl font-black text-red-700">
              !
            </div>

            <div className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.18em] text-red-700">
              Resultado de lectura
            </div>

            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-red-800 sm:text-4xl">
              ACCESO DENEGADO
            </h2>

            <p className="mx-auto mt-2 max-w-2xl text-base font-semibold leading-7 text-red-700 sm:text-lg">
              {error || "Chapita no asignada"}
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-[1.5rem] border border-red-100 bg-red-50/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-black text-[#201f1d]">
                  No se ha registrado ningún acceso
                </div>

                <p className="mt-1 text-sm leading-6 app-muted">
                  Comprueba la chapita o el estado del socio y vuelve a realizar la
                  lectura.
                </p>
              </div>

              {lastReadCode ? (
                <div className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-[0.6rem] font-black uppercase tracking-[0.1em] text-red-700">
                    Código leído
                  </div>

                  <div className="mt-1 font-mono text-sm font-black text-[#201f1d]">
                    {lastReadCode}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
          <div className="px-5 py-8 text-center sm:px-6 sm:py-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ece7dd] text-xl font-black text-[#645b4c]">
              RFID
            </div>

            <div className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
              Control de acceso preparado
            </div>

            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d] sm:text-4xl">
              ESPERANDO CHAPITA
            </h2>

            <p className="mx-auto mt-2 max-w-2xl text-base leading-7 app-muted">
              Pasa una chapita por el lector RFID para registrar la siguiente entrada
              o salida.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              LISTO PARA LEER
            </div>
          </div>
        </section>
      )}

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Estación RFID
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Lector de acceso
              </h2>

              <p className="mt-1 text-sm leading-6 app-muted">
                Pasa la chapita por el lector para identificar al socio y registrar
                automáticamente su entrada o salida.
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                processing
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {processing ? "PROCESANDO" : "LECTOR PREPARADO"}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6">
          <label className="block text-sm font-bold text-[#201f1d]">
            Código RFID

            <input
              ref={inputRef}
              autoFocus
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-4 font-mono text-xl font-black tracking-[0.04em] outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8 disabled:cursor-wait disabled:opacity-60"
              placeholder={
                processing
                  ? "Procesando lectura..."
                  : "Escanea la chapita o introduce el código"
              }
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              autoComplete="off"
              disabled={processing}
            />
          </label>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs app-muted">
              {lastReadCode ? (
                <>
                  Última lectura:{" "}
                  <span className="font-mono font-black text-[#201f1d]">
                    {lastReadCode}
                  </span>
                </>
              ) : (
                "El lector mantiene este campo preparado para la siguiente chapita."
              )}
            </div>

            <div
              className={`flex items-center gap-2 text-xs font-black ${
                processing ? "text-amber-800" : "text-emerald-700"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  processing
                    ? "animate-pulse bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />

              {processing ? "COMPROBANDO SOCIO" : "ESPERANDO LECTURA"}
            </div>
          </div>
        </form>
      </section>

      <section className="app-panel mb-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Ocupación actual
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Socios dentro del club
              </h2>

              <p className="mt-1 text-sm leading-6 app-muted">
                Socios que tienen una entrada registrada y todavía no han marcado su
                salida.
              </p>
            </div>

            <div
              className={`rounded-2xl border px-4 py-3 ${
                current.count > 0
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-black/8 bg-[#f7f4ee]"
              }`}
            >
              <div
                className={`text-[0.62rem] font-black uppercase tracking-[0.12em] ${
                  current.count > 0
                    ? "text-emerald-700"
                    : "app-muted"
                }`}
              >
                Dentro ahora
              </div>

              <div
                className={`mt-1 text-2xl font-black tabular-nums ${
                  current.count > 0
                    ? "text-emerald-800"
                    : "text-[#201f1d]"
                }`}
              >
                {current.count}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {current.inside.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-[#b4a78d]/40 bg-[#f7f4ee]/55 px-5 py-8 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ece7dd] text-lg font-black text-[#645b4c]">
                0
              </div>

              <div className="mt-3 font-black text-[#201f1d]">
                No hay socios dentro
              </div>

              <p className="mt-1 text-sm app-muted">
                Las próximas entradas aparecerán automáticamente en este listado.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {current.inside.map((member, index) => {
                const displayNumber =
                  member.displayNumber ??
                  member.memberNumber ??
                  member.id;

                const warnings: string[] = [];

                if (!member.active) {
                  warnings.push("Socio inactivo");
                }

                if (isExpired(member.expiresAt)) {
                  warnings.push("Socio caducado");
                }

                return (
                  <article
                    key={member.id}
                    className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88"
                  >
                    <div className="flex gap-4 p-4 sm:p-5">
                      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-black/8 bg-[#f7f4ee] sm:h-24 sm:w-20">
                        {member.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={member.photoUrl}
                            alt={`Foto de ${member.fullName}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xl font-black text-[#645b4c]">
                            {member.fullName
                              .trim()
                              .charAt(0)
                              .toUpperCase() || "?"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-emerald-700">
                              Dentro del club
                            </div>

                            <h3 className="mt-1 break-words text-base font-black leading-5 text-[#201f1d]">
                              {member.fullName}
                            </h3>

                            <div className="mt-1 text-xs app-muted">
                              Socio {displayNumber}
                            </div>
                          </div>

                          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.65rem] font-black text-emerald-700">
                            DENTRO
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                          <div>
                            <span className="app-muted">Entrada </span>

                            <strong className="font-black text-[#201f1d]">
                              {new Date(member.lastAccessAt).toLocaleTimeString(
                                "es-ES",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </strong>
                          </div>

                          <div>
                            <span className="app-muted">DNI </span>

                            <strong className="font-black text-[#201f1d]">
                              {member.dni}
                            </strong>
                          </div>
                        </div>

                        {warnings.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                            {warnings.join(" · ")}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-black/7 bg-[#f7f4ee]/55 px-4 py-2.5 sm:px-5">
                      <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                        Entrada #{String(index + 1).padStart(2, "0")}
                      </span>

                      {member.rfidCode ? (
                        <span className="font-mono text-xs font-bold text-[#645b4c]">
                          RFID {member.rfidCode}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-[2rem] border border-black/8 bg-white/82">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                  Cierre operativo
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Cerrar salidas pendientes
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                Registra automáticamente la salida de todos los socios que todavía
                constan dentro del club.
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                current.count > 0
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {current.count > 0
                ? `${current.count} SALIDA${current.count === 1 ? "" : "S"} PENDIENTE${current.count === 1 ? "" : "S"}`
                : "SIN SALIDAS PENDIENTES"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {autoCheckoutMessage ? (
            <div
              role="status"
              className="mb-4 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-emerald-700">
                Operación completada
              </div>

              <div className="mt-1 text-sm font-semibold text-emerald-700">
                {autoCheckoutMessage}
              </div>
            </div>
          ) : null}

          <div
            className={`rounded-[1.5rem] border p-5 ${
              current.count > 0
                ? "border-amber-200 bg-amber-50/45"
                : "border-black/8 bg-[#f7f4ee]/55"
            }`}
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-black text-[#201f1d]">
                  {current.count > 0
                    ? "Hay accesos abiertos"
                    : "Todos los accesos están cerrados"}
                </div>

                <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                  {current.count > 0
                    ? "Utiliza esta acción únicamente al finalizar la operativa o cuando necesites regularizar todos los accesos abiertos."
                    : "No hay ninguna entrada pendiente de registrar como salida."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleAutoCheckout()}
                disabled={autoCheckoutLoading || current.count === 0}
                className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
                  current.count > 0
                    ? "app-button-danger"
                    : "app-button-secondary"
                }`}
              >
                {autoCheckoutLoading
                  ? "Registrando salidas..."
                  : current.count > 0
                    ? "Cerrar todas las salidas"
                    : "Sin salidas pendientes"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
