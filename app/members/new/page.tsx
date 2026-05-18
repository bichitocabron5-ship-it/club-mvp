// app/members/new/page.tsx
"use client";

import { PageHeader } from "@/components/ui/page-header";
import { fetchJson } from "@/lib/fetch-json";
import type { SigningSessionData } from "@/lib/types";
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

export default function NewMemberPage() {
  const rfidRef = useRef<HTMLInputElement | null>(null);

  const [createdMember, setCreatedMember] = useState<CreatedMember | null>(null);
  const [signingSession, setSigningSession] = useState<SigningSessionData | null>(null);
  const [assigningRfid, setAssigningRfid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [rfidMessage, setRfidMessage] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    dni: "",
    phone: "",
    email: "",
    expiresAt: "",
  });

  const visibleMemberNumber = createdMember?.memberNumber ?? createdMember?.id ?? null;

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
        active: true,
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

    const cleanCode = code.trim();
    if (!cleanCode) return;

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
    setRfidMessage(`Chapita asignada correctamente: ${updated.rfidCode}`);
  }

  async function createSigningSession() {
    if (!createdMember) return;

    const res = await fetch("/api/signing-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: createdMember.id,
      }),
    });

    if (!res.ok) {
      alert("Error creando sesión de firma");
      return;
    }

    const session: SigningSessionData = await res.json();
    setSigningSession(session);
    setContractSigned(session.status === "SIGNED");
  }

  const signUrl =
    signingSession && `${window.location.origin}/sign/${signingSession.token}`;

  useEffect(() => {
    if (!signingSession?.token || contractSigned) return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchJson<SigningSessionData>(
          `/api/signing-sessions/${signingSession.token}`
        );

        setSigningSession(data);

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
    <main className="mx-auto max-w-4xl p-4 md:p-6">
      <PageHeader
        title="Alta de socio"
        description="Flujo guiado y corto: datos del socio, chapita y firma."
      />

      {!createdMember && (
        <form onSubmit={createMember} className="space-y-3 rounded border p-4">
          <h2 className="text-lg font-bold">1. Datos personales</h2>
          <p className="text-sm text-gray-600">
            Introduce los datos mínimos del alta. Teléfono y email quedarán
            disponibles también para la firma y la ficha del socio.
          </p>

          <input
            className="w-full rounded border p-3"
            placeholder="Nombre completo"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />

          <input
            className="w-full rounded border p-3"
            placeholder="DNI"
            value={form.dni}
            onChange={(e) => setForm({ ...form, dni: e.target.value })}
            required
          />

          <input
            className="w-full rounded border p-3"
            placeholder="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="w-full rounded border p-3"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <div>
            <label className="mb-1 block text-sm text-gray-500">
              Fecha de vencimiento
            </label>
            <input
              className="w-full rounded border p-3"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded bg-blue-600 p-3 font-bold text-white disabled:opacity-40"
          >
            {loading ? "Creando socio..." : "Crear socio y continuar"}
          </button>
        </form>
      )}

      {createdMember && (
        <div className="space-y-4">
          <section className="rounded border bg-green-50 p-4">
            <h2 className="text-lg font-bold text-green-800">
              Socio creado correctamente
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
                  RFID asignado
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
            </div>
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">2. Asignar RFID</h2>
            <p className="mb-3 text-sm text-gray-600">
              Escanea la chapita del socio ahora o continúa más tarde desde su
              ficha.
            </p>

            {rfidMessage && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded border border-green-200 bg-green-50 p-3 text-green-700">
                <span>{rfidMessage}</span>
                <button
                  type="button"
                  onClick={() => setRfidMessage("")}
                  className="rounded border border-green-300 px-3 py-1 text-sm"
                >
                  Cerrar
                </button>
              </div>
            )}

            {createdMember.rfidCode ? (
              <div className="rounded bg-green-50 p-3 text-green-700">
                Chapita asignada: <strong>{createdMember.rfidCode}</strong>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAssigningRfid(true);
                    setTimeout(() => rfidRef.current?.focus(), 0);
                  }}
                  className="rounded bg-gray-900 px-4 py-3 font-bold text-white"
                >
                  Asignar RFID escaneando
                </button>

                {assigningRfid && (
                  <input
                    ref={rfidRef}
                    autoFocus
                    className="mt-3 w-full rounded border border-blue-500 p-4 text-xl"
                    placeholder="Pasa la chapita ahora..."
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value) {
                        void assignRfid(value);
                      }
                    }}
                  />
                )}
              </>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">3. Firma de contrato</h2>
            <p className="mb-3 text-sm text-gray-600">
              La sesión de firma abrirá los datos del socio ya cargados para no
              volver a escribirlos.
            </p>

            {!signingSession && (
              <button
                type="button"
                onClick={createSigningSession}
                className="rounded bg-blue-600 px-4 py-3 font-bold text-white"
              >
                Crear sesión de firma
              </button>
            )}

            {signingSession && (
              <div className="space-y-3">
                <div className="rounded bg-gray-50 p-3">
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
                    <div className="rounded bg-green-100 p-3 font-bold text-green-700">
                      Contrato firmado correctamente.
                    </div>
                  )}

                  <input
                    className="w-full rounded border p-3"
                    value={signUrl || ""}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />

                  <p className="mt-2 text-sm text-gray-500">
                    En la tablet cambia `localhost` por la IP local del ordenador
                    si hace falta.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">Estado final</h2>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded border bg-gray-50 p-3">
                <div className="text-sm text-gray-500">Socio</div>
                <div className="font-semibold">
                  Creado con Nº {visibleMemberNumber}
                </div>
              </div>

              <div className="rounded border bg-gray-50 p-3">
                <div className="text-sm text-gray-500">Contrato</div>
                <div className="font-semibold">
                  {contractSigned
                    ? "Firmado"
                    : signingSession
                      ? "Pendiente de firma"
                      : "Sin iniciar"}
                </div>
              </div>

              <div className="rounded border bg-gray-50 p-3">
                <div className="text-sm text-gray-500">RFID</div>
                <div className="font-semibold">
                  {createdMember.rfidCode
                    ? `Asignado: ${createdMember.rfidCode}`
                    : "Pendiente"}
                </div>
              </div>

              <div className="rounded border bg-gray-50 p-3">
                <div className="text-sm text-gray-500">Contacto</div>
                <div className="font-semibold">
                  {createdMember.phone || createdMember.email
                    ? `${createdMember.phone || "Sin teléfono"} · ${createdMember.email || "Sin email"}`
                    : "Sin datos de contacto"}
                </div>
              </div>
            </div>

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
              <div className="mb-4 rounded bg-green-100 p-4 font-bold text-green-800">
                Socio listo para operar
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/members/${createdMember.id}`}
                className="rounded bg-green-600 px-4 py-3 font-bold text-white"
              >
                Ver ficha
              </Link>

              <Link
                href="/sales"
                className="rounded bg-blue-600 px-4 py-3 font-bold text-white"
              >
                Ir al TPV
              </Link>

              <Link
                href="/access"
                className="rounded bg-gray-900 px-4 py-3 font-bold text-white"
              >
                Control de acceso
              </Link>

              <Link
                href="/members"
                className="rounded border px-4 py-3 font-bold"
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
                  setForm({
                    fullName: "",
                    dni: "",
                    phone: "",
                    email: "",
                    expiresAt: "",
                  });
                }}
                className="rounded border px-4 py-3 font-bold"
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
