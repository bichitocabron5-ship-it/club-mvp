// app/members/new/page.tsx
"use client";

import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import { normalizeRfidCode } from "@/lib/rfid";
import type {
  InternalSigningSessionData,
  PublicSigningSessionData,
} from "@/lib/types";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CreatedMember = {
  id: number;
  memberNumber?: string | number | null;
  fullName: string;
  dni: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  expiresAt: string | null;
  rfidCode: string | null;
};

function isInternalSigningSessionData(
  value: unknown
): value is InternalSigningSessionData {
  const session = value as Partial<InternalSigningSessionData> | null;

  return (
    !!session &&
    typeof session.status === "string" &&
    typeof session.token === "string" &&
    session.token.length > 0 &&
    session.token !== "undefined" &&
    typeof session.signUrl === "string" &&
    session.signUrl.length > 0 &&
    !session.signUrl.endsWith("/undefined")
  );
}

export default function NewMemberPage() {
  const rfidRef = useRef<HTMLInputElement | null>(null);

  const [createdMember, setCreatedMember] = useState<CreatedMember | null>(null);
  const [signingSession, setSigningSession] =
    useState<InternalSigningSessionData | null>(null);
  const [assigningRfid, setAssigningRfid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [rfidMessage, setRfidMessage] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [rfidProcessing, setRfidProcessing] = useState(false);
  const [signingError, setSigningError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    dni: "",
    phone: "",
    email: "",
    expiresAt: "",
  });

  const visibleMemberNumber = createdMember?.memberNumber ?? createdMember?.id ?? null;

  function focusRfidInput() {
    setTimeout(() => rfidRef.current?.focus(), 0);
  }

  async function createMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: form.fullName,
        dni: form.dni,
        phone: form.phone,
        email: form.email,
        expiresAt: form.expiresAt || null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error creando socio");
      return;
    }

    const member: CreatedMember = await res.json();
    setCreatedMember(member);
  }

  async function assignRfid(code: string) {
    if (!createdMember) return;

    const cleanCode = normalizeRfidCode(code);
    if (!cleanCode || rfidProcessing) return;

    setRfidProcessing(true);

    try {
      const res = await fetch(`/api/members/${createdMember.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rfidCode: cleanCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error asignando RFID");
        return;
      }

      const updated: CreatedMember = await res.json();
      setCreatedMember(updated);
      setAssigningRfid(false);
      setRfidInput("");
      setRfidMessage(`Chapita asignada correctamente: ${updated.rfidCode}`);
    } finally {
      setRfidProcessing(false);
      focusRfidInput();
    }
  }

  async function createSigningSession() {
    if (!createdMember) return;
    setSigningError("");

    const res = await fetch("/api/signing-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: createdMember.id,
      }),
    });

    const data: unknown = await res.json();

    if (!res.ok) {
      const error =
        data && typeof data === "object" && "error" in data
          ? String(data.error)
          : "Error creando sesion de firma";
      setSigningError(error);
      alert(error);
      return;
    }

    if (!isInternalSigningSessionData(data)) {
      const error =
        "La sesion de firma se creo, pero no devolvio un enlace valido. No se abrira /sign/undefined.";
      setSigningError(error);
      alert(error);
      return;
    }

    setSigningSession(data);
    setContractSigned(data.status === "SIGNED");
  }

  const signUrl = signingSession?.signUrl ?? "";

  useEffect(() => {
    if (!signingSession?.token || contractSigned) return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchJson<PublicSigningSessionData>(
          `/api/signing-sessions/${signingSession.token}`
        );

        setSigningSession((current) =>
          current
            ? {
                ...current,
                ...data,
              }
            : current
        );

        if (data.status === "SIGNED") {
          setContractSigned(true);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [signingSession?.token, contractSigned]);

  useEffect(() => {
    if (!rfidMessage) return;

    const timeout = setTimeout(() => setRfidMessage(""), 4000);
    return () => clearTimeout(timeout);
  }, [rfidMessage]);

  const isReady =
    createdMember &&
    createdMember.active &&
    createdMember.rfidCode &&
    contractSigned;

  const missing = {
    rfid: !createdMember?.rfidCode,
    contract: !contractSigned,
    expires: !createdMember?.expiresAt,
  };

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <PageHeader
        title="Alta de socio"
        description="Flujo guiado y corto: datos del socio, chapita y firma."
      />

      {!createdMember && (
        <form onSubmit={createMember} className="app-panel-strong space-y-3 rounded-3xl p-4 md:p-5">
          <h2 className="text-lg font-bold">1. Datos personales</h2>
          <p className="text-sm text-gray-600">
            Introduce los datos mínimos del alta. Teléfono y email quedarán
            disponibles también para la firma y la ficha del socio.
          </p>

          <input
            className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Nombre completo"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />

          <input
            className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="DNI"
            value={form.dni}
            onChange={(e) => setForm({ ...form, dni: e.target.value })}
            required
          />

          <input
            className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <div>
            <label className="mb-1 block text-sm text-gray-500">
              Fecha de vencimiento
            </label>
            <input
              className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>

          <button
            disabled={loading}
            className="app-button-primary w-full rounded-2xl p-3 font-bold disabled:opacity-40"
          >
            {loading ? "Creando socio..." : "Crear socio y continuar"}
          </button>
        </form>
      )}

      {createdMember && (
        <div className="space-y-4">
          <section className="rounded-3xl border border-green-200 bg-green-50/95 p-4 md:p-5">
            <h2 className="text-lg font-bold text-green-800">
              Socio creado
            </h2>

            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-gray-600">Socio</div>
                <div>
                  <strong>{createdMember.fullName}</strong> - {createdMember.dni}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-600">Número de socio</div>
                <div className="text-lg font-semibold">
                  Nº socio {visibleMemberNumber}
                </div>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                ACTIVO
              </span>

              {createdMember.expiresAt ? (
                <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                  Vence: {new Date(createdMember.expiresAt).toLocaleDateString()}
                </span>
              ) : (
                <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                  Sin vencimiento
                </span>
              )}

              {createdMember.rfidCode ? (
                <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                  RFID {createdMember.rfidCode}
                </span>
              ) : (
                <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                  RFID pendiente
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
              <div>
                Teléfono: <strong>{createdMember.phone || "No indicado"}</strong>
              </div>
              <div>
                Email: <strong>{createdMember.email || "No indicado"}</strong>
              </div>
              <div>
                Contrato:{" "}
                <strong>
                  {contractSigned
                    ? "Firmado"
                    : signingSession
                      ? "Pendiente de firma"
                      : "Sin iniciar"}
                </strong>
              </div>
            </div>
          </section>

          <section className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-3 text-lg font-bold">Asignar chapita</h2>
            <p className="mb-3 text-sm text-gray-600">
              Escanea la chapita ahora o continúa más tarde desde la ficha.
            </p>

            {rfidMessage && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded border border-green-200 bg-green-50 p-3 text-green-700">
                <span>{rfidMessage}</span>
                <button
                  type="button"
                  onClick={() => setRfidMessage("")}
                  className="app-button-secondary rounded-full px-3 py-1 text-sm"
                >
                  Cerrar
                </button>
              </div>
            )}

            {createdMember.rfidCode ? (
                <div className="rounded-2xl bg-green-50 p-3 text-green-700">
                Chapita asignada: <strong>{createdMember.rfidCode}</strong>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAssigningRfid(true);
                    setRfidInput("");
                    focusRfidInput();
                  }}
                  className="app-button-primary rounded-full px-4 py-3 font-bold"
                >
                  Asignar chapita
                </button>

                {assigningRfid && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const cleanCode = normalizeRfidCode(rfidInput);
                      if (!cleanCode || rfidProcessing) {
                        focusRfidInput();
                        return;
                      }
                      void assignRfid(cleanCode);
                    }}
                  >
                    <input
                      ref={rfidRef}
                      autoFocus
                      className="w-full rounded-2xl border border-blue-500 bg-white p-4 text-xl"
                      placeholder="Escanea la chapita o pega el código"
                      value={rfidInput}
                      onChange={(e) => setRfidInput(e.target.value)}
                      disabled={rfidProcessing}
                    />
                    <p className="text-sm text-gray-500">
                      Escanea la chapita o pega el código.
                    </p>
                  </form>
                )}
              </>
            )}
          </section>

          <section className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-3 text-lg font-bold">Crear enlace de firma</h2>
            <p className="mb-3 text-sm text-gray-600">
              El enlace abrirá la firma con los datos del socio ya cargados.
            </p>

            {signingError && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-red-700">
                {signingError}
              </div>
            )}

            {!signingSession && (
              <button
                type="button"
                onClick={createSigningSession}
                className="app-button-primary rounded-full px-4 py-3 font-bold"
              >
                Crear enlace de firma
              </button>
            )}

            {signingSession && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gray-50 p-3">
                  Estado:{" "}
                  <strong className={contractSigned ? "text-green-700" : ""}>
                    {contractSigned ? "FIRMADO" : signingSession.status}
                  </strong>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-500">
                    Enlace para tablet
                  </label>

                  {contractSigned && (
                    <div className="rounded-2xl bg-green-100 p-3 font-bold text-green-700">
                      Contrato firmado correctamente.
                    </div>
                  )}

                  {!signUrl && !contractSigned ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
                      Falta el enlace de firma. Crea una nueva sesion antes de
                      abrir la tablet.
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-2xl border border-black/10 bg-white/80 p-3"
                      value={signUrl}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  )}

                  <p className="mt-2 text-sm text-gray-500">
                    En la tablet cambia `localhost` por la IP local del ordenador
                    si hace falta.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="app-panel rounded-3xl p-4 md:p-5">
            <h2 className="mb-3 text-lg font-bold">Acciones principales</h2>

            {!isReady && (
              <div className="mb-4 space-y-2">
                <div className="text-sm font-medium text-gray-600">
                  Pendiente para completar:
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {missing.rfid && (
                    <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                      Falta RFID
                    </span>
                  )}

                  {missing.contract && (
                    <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                      Falta contrato
                    </span>
                  )}

                  {missing.expires && (
                    <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                      Sin vencimiento
                    </span>
                  )}
                </div>
              </div>
            )}

            {isReady && (
                <div className="mb-4 rounded-2xl bg-green-100 p-4 font-bold text-green-800">
                Socio listo para operar
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/members/${createdMember.id}`}
                className="rounded-full bg-green-600 px-4 py-3 font-bold text-white"
              >
                Abrir ficha
              </Link>

              <Link
                href="/sales"
                className="app-button-primary rounded-full px-4 py-3 font-bold"
              >
                Ir al TPV
              </Link>

              <Link
                href="/access"
                className="rounded-full bg-gray-900 px-4 py-3 font-bold text-white"
              >
                Control de acceso
              </Link>

              <Link
                href="/members"
                className="app-button-secondary rounded-full px-4 py-3 font-bold"
              >
                Volver a socios
              </Link>

              <button
                type="button"
                onClick={() => {
                  setCreatedMember(null);
                  setSigningSession(null);
                  setContractSigned(false);
                  setAssigningRfid(false);
                  setRfidMessage("");
                  setSigningError("");
                  setForm({
                    fullName: "",
                    dni: "",
                    phone: "",
                    email: "",
                    expiresAt: "",
                  });
                }}
                className="app-button-secondary rounded-full px-4 py-3 font-bold"
              >
                Crear otro socio
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
