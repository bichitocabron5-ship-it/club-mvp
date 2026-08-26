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
        description="Completa el expediente inicial, asigna la chapita RFID y formaliza el contrato."
      />

      <section className="mb-5 overflow-hidden rounded-[1.75rem] border border-black/8 bg-white/75">
        <div className="grid sm:grid-cols-3">
          <div
            className={`relative px-4 py-4 sm:px-5 ${
              createdMember ? "bg-emerald-50/60" : "bg-[#f7f4ee]"
            }`}
          >
            <div
              className={`text-[0.62rem] font-black uppercase tracking-[0.14em] ${
                createdMember ? "text-emerald-700" : "text-[#a7282d]"
              }`}
            >
              Paso 01
            </div>

            <div className="mt-1 font-black text-[#201f1d]">
              Datos del socio
            </div>

            <div className="mt-1 text-xs app-muted">
              {createdMember ? "Completado" : "En curso"}
            </div>

            <div
              className={`absolute inset-x-0 bottom-0 h-[3px] ${
                createdMember ? "bg-emerald-500" : "bg-[#a7282d]"
              }`}
            />
          </div>

          <div
            className={`relative border-t border-black/7 px-4 py-4 sm:border-l sm:border-t-0 sm:px-5 ${
              createdMember?.rfidCode ? "bg-emerald-50/60" : "bg-white/50"
            }`}
          >
            <div
              className={`text-[0.62rem] font-black uppercase tracking-[0.14em] ${
                createdMember?.rfidCode ? "text-emerald-700" : "app-muted"
              }`}
            >
              Paso 02
            </div>

            <div className="mt-1 font-black text-[#201f1d]">
              Chapita RFID
            </div>

            <div className="mt-1 text-xs app-muted">
              {createdMember?.rfidCode
                ? "Completado"
                : createdMember
                  ? "Pendiente"
                  : "A continuación"}
            </div>

            {createdMember?.rfidCode ? (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500" />
            ) : null}
          </div>

          <div
            className={`relative border-t border-black/7 px-4 py-4 sm:border-l sm:border-t-0 sm:px-5 ${
              contractSigned ? "bg-emerald-50/60" : "bg-white/50"
            }`}
          >
            <div
              className={`text-[0.62rem] font-black uppercase tracking-[0.14em] ${
                contractSigned ? "text-emerald-700" : "app-muted"
              }`}
            >
              Paso 03
            </div>

            <div className="mt-1 font-black text-[#201f1d]">
              Contrato y firma
            </div>

            <div className="mt-1 text-xs app-muted">
              {contractSigned
                ? "Completado"
                : createdMember
                  ? "Pendiente"
                  : "A continuación"}
            </div>

            {contractSigned ? (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500" />
            ) : null}
          </div>
        </div>
      </section>

      {!createdMember && (
        <form
          onSubmit={createMember}
          className="app-panel overflow-hidden rounded-[2rem]"
        >
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                    Paso 01
                  </span>
                </div>

                <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                  Datos personales
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                  Introduce los datos esenciales para crear el expediente del socio.
                  Podrás completar el resto desde su ficha.
                </p>
              </div>

              <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-black text-[#645b4c]">
                NUEVO SOCIO
              </span>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
            <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
              Nombre completo

              <input
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                placeholder="Nombre y apellidos"
                value={form.fullName}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fullName: e.target.value,
                  })
                }
                required
              />
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              DNI / documento

              <input
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                placeholder="Documento de identidad"
                value={form.dni}
                onChange={(e) =>
                  setForm({
                    ...form,
                    dni: e.target.value,
                  })
                }
                required
              />
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              Teléfono

              <input
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                placeholder="Teléfono"
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value,
                  })
                }
              />
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              Correo electrónico

              <input
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                type="email"
                placeholder="correo@ejemplo.com"
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
              />
            </label>

            <label className="block text-sm font-bold text-[#201f1d]">
              Fecha de vencimiento

              <input
                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                type="date"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    expiresAt: e.target.value,
                  })
                }
              />

              <span className="mt-2 block text-xs font-normal app-muted">
                Déjala vacía si la membresía no tiene vencimiento.
              </span>
            </label>
          </div>

          <div className="border-t border-black/7 bg-[#f7f4ee]/50 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 app-muted">
                Al continuar se creará el socio y pasaremos a la asignación RFID.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {loading ? "Creando socio..." : "Crear socio y continuar"}
              </button>
            </div>
          </div>
        </form>
      )}

      {createdMember && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white/82">
            <div className="border-b border-emerald-100 bg-emerald-50/55 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-[2px] w-6 rounded-full bg-emerald-500" />

                    <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-emerald-700">
                      Paso 01 completado
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Socio creado correctamente
                  </h2>

                  <p className="mt-1 text-sm leading-6 app-muted">
                    El expediente ya existe. Ahora puedes completar la identificación RFID
                    y formalizar el contrato.
                  </p>
                </div>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                  ACTIVO
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Número de socio
                  </div>

                  <div className="mt-2 text-xl font-black text-[#201f1d]">
                    Nº {visibleMemberNumber}
                  </div>
                </div>

                <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4 sm:col-span-1 lg:col-span-2">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Socio
                  </div>

                  <div className="mt-2 font-black text-[#201f1d]">
                    {createdMember.fullName}
                  </div>

                  <div className="mt-1 text-sm app-muted">
                    DNI {createdMember.dni}
                  </div>
                </div>

                <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Membresía
                  </div>

                  <div className="mt-2 font-black text-[#201f1d]">
                    {createdMember.expiresAt
                      ? new Date(createdMember.expiresAt).toLocaleDateString("es-ES")
                      : "Sin vencimiento"}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.25rem] border border-black/7 bg-white p-4">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Teléfono
                  </div>

                  <div className="mt-1 break-words text-sm font-bold text-[#201f1d]">
                    {createdMember.phone || "No indicado"}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-black/7 bg-white p-4">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Correo electrónico
                  </div>

                  <div className="mt-1 break-words text-sm font-bold text-[#201f1d]">
                    {createdMember.email || "No indicado"}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-black/7 bg-white p-4">
                  <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                    Contrato
                  </div>

                  <div
                    className={`mt-1 text-sm font-black ${
                      contractSigned
                        ? "text-emerald-700"
                        : signingSession
                          ? "text-amber-800"
                          : "text-[#201f1d]"
                    }`}
                  >
                    {contractSigned
                      ? "Firmado"
                      : signingSession
                        ? "Pendiente de firma"
                        : "Sin iniciar"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`overflow-hidden rounded-[2rem] border ${
              createdMember.rfidCode
                ? "border-emerald-200 bg-white/82"
                : "border-black/8 bg-white/82"
            }`}
          >
            <div
              className={`border-b px-5 py-5 sm:px-6 ${
                createdMember.rfidCode
                  ? "border-emerald-100 bg-emerald-50/45"
                  : "border-black/7"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`h-[2px] w-6 rounded-full ${
                        createdMember.rfidCode ? "bg-emerald-500" : "bg-[#a7282d]"
                      }`}
                    />

                    <span
                      className={`text-[0.65rem] font-black uppercase tracking-[0.2em] ${
                        createdMember.rfidCode
                          ? "text-emerald-700"
                          : "text-[#a7282d]"
                      }`}
                    >
                      {createdMember.rfidCode ? "Paso 02 completado" : "Paso 02"}
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Chapita RFID
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                    {createdMember.rfidCode
                      ? "La identificación RFID ya está vinculada al expediente."
                      : "Asigna la chapita física del socio mediante el lector RFID."}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                    createdMember.rfidCode
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {createdMember.rfidCode ? "RFID ASIGNADO" : "RFID PENDIENTE"}
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {rfidMessage ? (
                <div
                  role="status"
                  className="mb-4 flex flex-col gap-3 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{rfidMessage}</span>

                  <button
                    type="button"
                    onClick={() => setRfidMessage("")}
                    className="app-button-secondary inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    Cerrar
                  </button>
                </div>
              ) : null}

              {createdMember.rfidCode ? (
                <div className="flex flex-col gap-4 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/55 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-emerald-700">
                      Identificador asignado
                    </div>

                    <div className="mt-2 font-mono text-lg font-black tracking-[0.08em] text-[#201f1d]">
                      {createdMember.rfidCode}
                    </div>
                  </div>

                  <span className="w-fit rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-700">
                    LISTO
                  </span>
                </div>
              ) : (
                <>
                  {!assigningRfid ? (
                    <div className="flex flex-col gap-4 rounded-[1.5rem] border border-dashed border-[#b4a78d]/45 bg-[#f7f4ee]/55 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-black text-[#201f1d]">
                          Chapita pendiente de asignar
                        </div>

                        <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                          Pulsa el botón y acerca la chapita al lector. También puedes
                          pegar manualmente el código.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAssigningRfid(true);
                          setRfidInput("");
                          focusRfidInput();
                        }}
                        className="app-button-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-3 font-bold sm:w-auto"
                      >
                        Asignar chapita
                      </button>
                    </div>
                  ) : (
                    <form
                      className="overflow-hidden rounded-[1.5rem] border border-[#a7282d]/20 bg-[#f7f4ee]/65"
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
                      <div className="border-b border-black/7 px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-black text-[#201f1d]">
                              Lector RFID preparado
                            </div>

                            <p className="mt-1 text-sm app-muted">
                              Acerca la chapita al lector para completar la asignación.
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-xs font-black text-[#a7282d]">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#a7282d]" />
                            ESPERANDO LECTURA
                          </div>
                        </div>
                      </div>

                      <div className="p-4 sm:p-5">
                        <input
                          ref={rfidRef}
                          autoFocus
                          className="w-full rounded-xl border border-[#a7282d]/30 bg-white px-4 py-3 font-mono text-lg font-bold outline-none focus:border-[#a7282d]/50 focus:ring-4 focus:ring-[#a7282d]/8"
                          placeholder="Esperando código RFID..."
                          value={rfidInput}
                          onChange={(e) => setRfidInput(e.target.value)}
                          disabled={rfidProcessing}
                        />

                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs app-muted">
                            Mantén este campo activo hasta completar la lectura.
                          </p>

                          <button
                            type="button"
                            onClick={() => {
                              setAssigningRfid(false);
                              setRfidInput("");
                            }}
                            disabled={rfidProcessing}
                            className="app-button-secondary inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>

                        {rfidProcessing ? (
                          <div className="mt-3 rounded-xl border border-[#b4a78d]/25 bg-white/75 px-4 py-3 text-sm font-semibold text-[#645b4c]">
                            Guardando RFID...
                          </div>
                        ) : null}
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </section>

          <section
            className={`overflow-hidden rounded-[2rem] border ${
              contractSigned
                ? "border-emerald-200 bg-white/82"
                : "border-black/8 bg-white/82"
            }`}
          >
            <div
              className={`border-b px-5 py-5 sm:px-6 ${
                contractSigned
                  ? "border-emerald-100 bg-emerald-50/45"
                  : "border-black/7"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`h-[2px] w-6 rounded-full ${
                        contractSigned ? "bg-emerald-500" : "bg-[#a7282d]"
                      }`}
                    />

                    <span
                      className={`text-[0.65rem] font-black uppercase tracking-[0.2em] ${
                        contractSigned
                          ? "text-emerald-700"
                          : "text-[#a7282d]"
                      }`}
                    >
                      {contractSigned ? "Paso 03 completado" : "Paso 03"}
                    </span>
                  </div>

                  <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                    Contrato y firma
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                    {contractSigned
                      ? "El contrato del socio ha sido firmado correctamente."
                      : signingSession
                        ? "La sesión está preparada. Abre el enlace en el dispositivo donde firmará el socio."
                        : "Genera una sesión segura para formalizar el contrato del socio."}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                    contractSigned
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : signingSession
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]"
                  }`}
                >
                  {contractSigned
                    ? "CONTRATO FIRMADO"
                    : signingSession
                      ? "FIRMA PENDIENTE"
                      : "SIN INICIAR"}
                </span>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {contractSigned ? (
                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/55 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 font-black text-emerald-700">
                      ✓
                    </div>

                    <div>
                      <div className="font-black text-[#201f1d]">
                        Contrato formalizado
                      </div>

                      <div className="mt-0.5 text-sm text-emerald-700">
                        La firma ya consta en el expediente.
                      </div>
                    </div>
                  </div>
                </div>
              ) : signingSession ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50/45">
                    <div className="border-b border-amber-200/70 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-black text-[#201f1d]">
                            Esperando la firma del socio
                          </div>

                          <p className="mt-1 text-sm leading-6 app-muted">
                            La pantalla se actualizará automáticamente cuando se complete
                            la firma.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-black text-amber-800">
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
                          ESPERANDO FIRMA
                        </div>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5">
                      <div className="rounded-[1.25rem] border border-black/7 bg-white/80 p-4">
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                          Enlace de firma
                        </div>

                        <div className="mt-2 break-all font-mono text-sm font-bold text-[#201f1d]">
                          {signUrl}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <a
                          href={signUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="app-button-primary inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-center font-bold"
                        >
                          Abrir pantalla de firma
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(signUrl);
                          }}
                          className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 font-bold"
                        >
                          Copiar enlace
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-4 py-3 text-sm leading-6 app-muted">
                    Puedes abrir este enlace en una tablet, móvil u otro dispositivo.
                    No cierres esta pantalla: el estado se actualizará cuando el contrato
                    quede firmado.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5 rounded-[1.5rem] border border-dashed border-[#b4a78d]/45 bg-[#f7f4ee]/55 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-black text-[#201f1d]">
                      Contrato pendiente
                    </div>

                    <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                      Crea una sesión de firma para generar el enlace seguro que utilizará
                      el socio.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void createSigningSession()}
                    className="app-button-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 font-bold sm:w-auto"
                  >
                    Crear sesión de firma
                  </button>
                </div>
              )}
            </div>
          </section>

        {contractSigned ? (
          <section className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white/82">
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-black text-emerald-700">
                    ✓
                  </div>

                  <div>
                    <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-emerald-700">
                      Alta completada
                    </div>

                    <h2 className="mt-1 text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                      {createdMember.fullName} ya está dado de alta
                    </h2>

                    <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                      El socio ha sido creado y el contrato está firmado. Puedes abrir
                      su expediente o iniciar una nueva alta.
                    </p>

                    {!createdMember.rfidCode ? (
                      <div className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">
                        RFID PENDIENTE
                      </div>
                    ) : (
                      <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                        EXPEDIENTE INICIAL COMPLETO
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <Link
                    href={`/members/${createdMember.id}`}
                    className="app-button-primary inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 text-center font-bold"
                  >
                    Abrir expediente
                  </Link>

                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="app-button-secondary inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 font-bold"
                  >
                    Dar de alta otro socio
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

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
