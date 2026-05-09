// app/members/new/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CreatedMember = {
  id: number;
  fullName: string;
  dni: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  expiresAt: string | null;
  rfidCode: string | null;
};

type SigningSession = {
  id: number;
  token: string;
  memberId: number;
  status: string;
  signatureImage: string | null;
  signedAt: string | null;
  createdAt: string;
};

export default function NewMemberPage() {
  const rfidRef = useRef<HTMLInputElement | null>(null);

  const [createdMember, setCreatedMember] = useState<CreatedMember | null>(null);
  const [signingSession, setSigningSession] = useState<SigningSession | null>(null);
  const [assigningRfid, setAssigningRfid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    dni: "",
    phone: "",
    email: "",
    expiresAt: "",
  });

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
    alert("RFID asignado correctamente");
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

    const session = await res.json();
    setSigningSession(session);
    setContractSigned(session.status === "SIGNED");
  }

  const signUrl =
    signingSession && `${window.location.origin}/sign/${signingSession.token}`;

  useEffect(() => {
    if (!signingSession?.token || contractSigned) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/signing-sessions/${signingSession.token}`);
      const data: SigningSession = await res.json();

      setSigningSession(data);

      if (data.status === "SIGNED") {
        setContractSigned(true);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [signingSession?.token, contractSigned]);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Alta de socio</h1>
        <p className="text-sm text-gray-500">
          Flujo guiado: datos, RFID y firma de contrato.
        </p>
      </div>

      {!createdMember && (
        <form onSubmit={createMember} className="space-y-3 rounded border p-4">
          <h2 className="text-lg font-bold">1. Datos personales</h2>

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
            {loading ? "Creando..." : "Crear socio"}
          </button>
        </form>
      )}

      {createdMember && (
        <div className="space-y-4">
          <section className="rounded border bg-green-50 p-4">
            <h2 className="text-lg font-bold text-green-800">
              Socio creado correctamente
            </h2>

            <div className="mt-2">
              <strong>{createdMember.fullName}</strong> — {createdMember.dni}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                ACTIVO
              </span>

              {createdMember.expiresAt ? (
                <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                  Vence:{" "}
                  {new Date(createdMember.expiresAt).toLocaleDateString()}
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
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">2. Asignar RFID</h2>

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
                    En la tablet cambia localhost por la IP local del ordenador
                    si hace falta.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-3 text-lg font-bold">Estado final</h2>

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
                href={`/members/${createdMember?.id}`}
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