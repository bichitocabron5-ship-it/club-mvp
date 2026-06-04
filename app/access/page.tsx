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

  return date.toLocaleDateString();
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
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

function getScanResultText(scan: LastAccessScan) {
  if (scan.status === "DENIED") {
    return scan.error || "Acceso denegado";
  }

  return scan.action === "OUT" ? "Salida registrada" : "Entrada registrada";
}

function AccessMemberCard({ scan }: { scan: LastAccessScan }) {
  const member = scan.member;
  const warnings = getMemberWarnings(member);
  const expired = isExpired(member.expiresAt);
  const displayNumber = member.displayNumber ?? member.memberNumber ?? member.id;
  const cardTone =
    scan.status === "OK"
      ? "border-green-500 bg-green-50/90"
      : "border-red-500 bg-red-50/90";
  const resultTone =
    scan.status === "OK" ? "text-green-800" : "text-red-800";
  const resultBadge =
    scan.status === "OK"
      ? scan.action === "IN"
        ? "bg-green-700 text-white"
        : "bg-blue-700 text-white"
      : "bg-red-700 text-white";

  return (
    <section className={`mb-6 rounded-3xl border-4 p-4 shadow-xl md:p-6 ${cardTone}`}>
      <div className="grid gap-5 md:grid-cols-[18rem_minmax(0,1fr)] md:items-stretch">
        <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-3xl border border-black/10 bg-white">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.photoUrl}
              alt={`Foto de ${member.fullName}`}
              className="h-full max-h-[24rem] w-full object-cover md:max-h-none"
            />
          ) : (
            <div className="text-lg font-bold text-gray-500">Sin foto</div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold uppercase tracking-wide text-gray-500">
                Resultado
              </div>
              <h2 className={`mt-1 text-3xl font-black md:text-5xl ${resultTone}`}>
                {getScanResultText(scan)}
              </h2>
              {scan.status === "DENIED" && scan.message ? (
                <div className="mt-2 text-lg font-semibold text-red-800">
                  {scan.message}
                </div>
              ) : null}
            </div>

            <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ${resultBadge}`}>
              {scan.status === "OK"
                ? scan.action === "IN"
                  ? "ENTRADA"
                  : "SALIDA"
                : "DENEGADO"}
            </span>
          </div>

          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-gray-500">
              Socio
            </div>
            <div className="mt-1 break-words text-3xl font-black text-gray-950 md:text-5xl">
              {member.fullName}
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div className="border-t border-black/10 pt-3">
              <dt className="text-sm font-semibold text-gray-500">Nro. socio</dt>
              <dd className="mt-1 text-2xl font-black text-gray-950">
                {displayNumber}
              </dd>
            </div>

            <div className="border-t border-black/10 pt-3">
              <dt className="text-sm font-semibold text-gray-500">DNI</dt>
              <dd className="mt-1 text-2xl font-bold text-gray-950">{member.dni}</dd>
            </div>

            <div className="border-t border-black/10 pt-3">
              <dt className="text-sm font-semibold text-gray-500">Vencimiento</dt>
              <dd
                className={
                  expired
                    ? "mt-1 text-xl font-black text-red-800"
                    : "mt-1 text-xl font-bold text-gray-950"
                }
              >
                {formatDate(member.expiresAt)}
              </dd>
            </div>

            <div className="border-t border-black/10 pt-3">
              <dt className="text-sm font-semibold text-gray-500">Estado</dt>
              <dd className="mt-1">
                <span
                  className={
                    member.active
                      ? "inline-flex rounded-full bg-green-700 px-3 py-1 text-sm font-black text-white"
                      : "inline-flex rounded-full bg-red-700 px-3 py-1 text-sm font-black text-white"
                  }
                >
                  {member.active ? "Activo" : "Inactivo"}
                </span>
              </dd>
            </div>
          </dl>

          {warnings.length > 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-lg font-bold text-amber-950">
              {warnings.join(" - ")}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 text-sm font-medium text-gray-600">
            <span>Lectura: {scan.readCode}</span>
            {scan.scannedAt ? <span>Hora: {formatTime(scan.scannedAt)}</span> : null}
            {member.rfidCode ? <span>RFID: {member.rfidCode}</span> : null}
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
      `Hay ${current.count} socios dentro. Se registrara salida automatica para todos.`
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
        throw new Error(data?.error || "Error registrando salida automatica");
      }

      const count = Number(data?.count || 0);
      setAutoCheckoutMessage(
        `Se registro la salida automatica de ${count} socio(s).`
      );
      await loadCurrent();
    } catch (autoCheckoutError) {
      setError(
        autoCheckoutError instanceof Error
          ? autoCheckoutError.message
          : "Error registrando salida automatica"
      );
    } finally {
      setAutoCheckoutLoading(false);
      focusInput();
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Control de acceso</h1>
        <p className="mt-2 text-sm text-gray-500">
          Escanea una chapita para registrar entrada o salida.
        </p>
      </div>

      {lastScan ? (
        <AccessMemberCard scan={lastScan} />
      ) : (
        <section
          className={
            screenStatus === "DENIED"
              ? "mb-6 rounded-3xl border-4 border-red-600 bg-red-100 p-8 text-center text-red-800"
              : "mb-6 rounded-3xl border-4 border-gray-300 bg-gray-50 p-8 text-center text-gray-600"
          }
        >
          {screenStatus === "DENIED" ? (
            <>
              <div className="text-4xl font-black md:text-5xl">ACCESO DENEGADO</div>
              <div className="mt-3 text-2xl">{error || "Chapita no asignada"}</div>
            </>
          ) : (
            <>
              <div className="text-4xl font-black">ESPERANDO CHAPITA</div>
              <div className="mt-3 text-lg">Pasa una chapita por el lector RFID</div>
            </>
          )}
        </section>
      )}

      <form onSubmit={handleSubmit} className="app-panel mb-6 rounded-3xl p-4 md:p-5">
        <label className="mb-2 block text-sm font-medium">Escanear chapita</label>

        <input
          ref={inputRef}
          autoFocus
          className="w-full rounded-2xl border border-black/10 bg-white p-4 text-xl"
          placeholder="Escanea la chapita o pega el codigo"
          value={rfidInput}
          onChange={(e) => setRfidInput(e.target.value)}
          autoComplete="off"
          disabled={processing}
        />

        {lastReadCode && (
          <div className="mt-2 text-xs text-gray-500">Lectura: {lastReadCode}</div>
        )}

        {error && (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
      </form>

      <section className="app-panel rounded-3xl p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold">Dentro ahora</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAutoCheckout()}
              disabled={autoCheckoutLoading || current.count === 0}
              className="rounded-2xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {autoCheckoutLoading
                ? "Registrando..."
                : "Cerrar salidas pendientes"}
            </button>
            <div className="rounded-2xl bg-gray-900 px-4 py-2 text-white">
              Aforo: <strong>{current.count}</strong>
            </div>
          </div>
        </div>

        {autoCheckoutMessage ? (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-800">
            {autoCheckoutMessage}
          </div>
        ) : null}

        {current.inside.length === 0 && (
          <div className="rounded-2xl bg-gray-50 p-3 text-gray-500">
            No hay socios dentro.
          </div>
        )}

        <div className="space-y-2">
          {current.inside.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-white/70 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-semibold">{member.fullName}</div>
                <div className="text-sm text-gray-500">
                  {member.displayNumber ? `Nro. ${member.displayNumber} - ` : ""}
                  {member.dni}
                </div>
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
