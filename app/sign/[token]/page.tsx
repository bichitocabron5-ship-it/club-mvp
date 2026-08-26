"use client";

import type { PublicSigningSessionData } from "@/lib/types";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

type SignForm = {
  fullName: string;
  dni: string;
  address: string;
  birthPlace: string;
  birthDate: string;
  phone: string;
  email: string;
  consumptionGrams: string;
};

const emptyForm: SignForm = {
  fullName: "",
  dni: "",
  address: "",
  birthPlace: "",
  birthDate: "",
  phone: "",
  email: "",
  consumptionGrams: "",
};

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export default function SignPage() {
  const params = useParams<{ token?: string | string[] }>();
  const token = typeof params.token === "string" ? params.token : "";

  const sigRef = useRef<SignatureCanvas | null>(null);
  const savingRef = useRef(false);
  const [sessionState, setSessionState] = useState<{
    token: string;
    data: PublicSigningSessionData;
  } | null>(null);
  const [savedToken, setSavedToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [errorState, setErrorState] = useState<{
    token: string;
    message: string;
  } | null>(null);
  const [form, setForm] = useState<SignForm>(emptyForm);
  const session = sessionState?.token === token ? sessionState.data : null;
  const saved = savedToken === token;
  const error = !token
    ? "Falta el token de firma en la URL."
    : errorState?.token === token
      ? errorState.message
      : "";

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    void fetch(`/api/signing-sessions/${token}`)
      .then(async (res) => {
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setErrorState({
            token,
            message: data.error || "La sesión de firma no está disponible",
          });
          return;
        }

        const sessionData = data as PublicSigningSessionData;

        setErrorState(null);
        setSavedToken("");
        setSessionState({ token, data: sessionData });
        setForm({
          fullName: sessionData.member?.fullName || "",
          dni: sessionData.member?.dni || "",
          address: sessionData.member?.address || "",
          birthPlace: sessionData.member?.birthPlace || "",
          birthDate: toDateInputValue(sessionData.member?.birthDate),
          phone: sessionData.member?.phone || "",
          email: sessionData.member?.email || "",
          consumptionGrams: String(
            sessionData.member?.consumptionGrams ??
              sessionData.clubSettings?.defaultMonthlyLimitG ??
              30
          ),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setErrorState({
            token,
            message: "La sesión de firma no está disponible",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function saveSignature() {
    if (!token || savingRef.current || saved) {
      return;
    }

   if (!sigRef.current || sigRef.current.isEmpty()) {
      setSignatureError("Debes firmar dentro del recuadro antes de continuar.");
      return;
    }

    setSignatureError("");
    setSaveError("");

    const signatureImage = sigRef.current
      .getTrimmedCanvas()
      .toDataURL("image/png");

    savingRef.current = true;
    setSaving(true);

    try {
      const res = await fetch(`/api/signing-sessions/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signatureImage, form }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const err = data as { error?: string } | null;

        setSaveError(
          err?.error || "No se ha podido guardar la firma. Inténtalo de nuevo."
        );

        return;
      }

      if (data) {
        setSessionState({ token, data: data as PublicSigningSessionData });
      }

      setSavedToken(token);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f0e9] p-4 sm:p-6">
        <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-red-200 bg-white shadow-[0_24px_70px_rgba(32,31,29,0.08)]">
          <div className="bg-red-50 px-6 py-8 text-center sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl font-black text-red-700">
              !
            </div>

            <div className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.18em] text-red-700">
              Firma digital
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              Sesión no disponible
            </h1>

            <p className="mt-3 leading-7 text-red-700">
              {error}
            </p>
          </div>

          <div className="border-t border-red-100 px-6 py-4 text-center text-sm text-[#6d6860]">
            Solicita al personal del club una nueva sesión de firma.
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f0e9] p-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#b4a78d]/30 border-t-[#a7282d]" />

          <div className="mt-4 font-black text-[#201f1d]">
            Preparando contrato
          </div>

          <p className="mt-1 text-sm text-[#6d6860]">
            Estamos cargando los datos de la sesión de firma.
          </p>
        </div>
      </main>
    );
  }

  if (saved || session.status === "SIGNED") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f0e9] p-4 sm:p-6">
        <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-[0_24px_70px_rgba(32,31,29,0.08)]">
          <div className="bg-emerald-50 px-6 py-9 text-center sm:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-3xl font-black text-emerald-700">
              ✓
            </div>

            <div className="mt-5 text-[0.68rem] font-black uppercase tracking-[0.18em] text-emerald-700">
              Proceso completado
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
              Firma guardada
            </h1>

            <p className="mt-3 text-base leading-7 text-[#6d6860]">
              El contrato se ha firmado correctamente y ha quedado registrado.
            </p>
          </div>

          <div className="border-t border-emerald-100 px-6 py-5 text-center">
            <div className="font-black text-[#201f1d]">
              Puedes devolver la tablet
            </div>

            <p className="mt-1 text-sm text-[#6d6860]">
              No necesitas realizar ninguna otra acción.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f0e9] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 text-center">
          <div className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
            Zen Wolves
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d] sm:text-4xl">
            Firma de contrato
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6d6860] sm:text-base">
            Revisa tus datos y el contrato antes de confirmar la firma.
          </p>
        </header>

        <div className="mb-5 overflow-hidden rounded-[2rem] border border-black/8 bg-white shadow-[0_16px_50px_rgba(32,31,29,0.05)]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
                Socio
              </div>

              <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.03em] text-[#201f1d]">
                {session.member.fullName}
              </h2>

              <p className="mt-1 text-sm text-[#6d6860]">
                Comprueba que tus datos sean correctos antes de firmar.
              </p>
            </div>

            <div className="shrink-0 rounded-2xl border border-[#b4a78d]/30 bg-[#f7f4ee] px-4 py-3">
              <div className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-[#6d6860]">
                Nº de socio
              </div>

              <div className="mt-1 text-xl font-black tabular-nums text-[#201f1d]">
                {session.member.displayNumber ?? "-"}
              </div>
            </div>
          </div>
        </div>

        {session.contractTemplate ? (
          <div className="px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6d6860]">
              <span>Contrato preparado:</span>

              <strong className="text-[#201f1d]">
                {session.contractTemplate.name}
              </strong>

              <span className="rounded-full border border-black/8 bg-[#f7f4ee] px-2 py-0.5 text-xs font-black">
                v{session.contractTemplate.version}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {session.contractTemplate ? (
        <section className="mb-5 overflow-hidden rounded-[2rem] border border-black/8 bg-white shadow-[0_16px_50px_rgba(32,31,29,0.05)]">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
              Documento
            </div>

            <h2 className="mt-1 text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Contrato a firmar
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#6d6860]">
              Lee el documento completo antes de continuar con la firma.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="break-words font-black text-[#201f1d]">
                  {session.contractTemplate.name}
                </div>

                <div className="mt-1 text-sm text-[#6d6860]">
                  Versión {session.contractTemplate.version}
                </div>
              </div>

              <a
                href={session.contractTemplate.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-[#201f1d] bg-[#201f1d] px-5 py-3 text-sm font-black text-white transition hover:bg-black sm:w-auto"
              >
                Abrir contrato
              </a>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#6d6860]">
              El documento se abrirá en una pestaña nueva para que puedas revisarlo
              sin perder esta sesión de firma.
            </p>
          </div>
        </section>
      ) : null}

      <section className="mb-5 overflow-hidden rounded-[2rem] border border-black/8 bg-white shadow-[0_16px_50px_rgba(32,31,29,0.05)]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
            Datos personales
          </div>

          <h2 className="mt-1 text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Revisa tus datos
          </h2>

          <p className="mt-1 text-sm leading-6 text-[#6d6860]">
            Estos son los datos que se incorporarán al contrato.
          </p>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <label className="block sm:col-span-2">
            <span className="text-sm font-bold text-[#201f1d]">
              Nombre completo
            </span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Nombre completo"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">DNI</span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="DNI"
              value={form.dni}
              onChange={(e) => setForm({ ...form, dni: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">
              Fecha de nacimiento
            </span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">Teléfono</span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Teléfono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">
              Correo electrónico
            </span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              type="email"
              placeholder="correo@ejemplo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-bold text-[#201f1d]">Domicilio</span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Domicilio"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">
              Lugar de nacimiento
            </span>

            <input
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
              placeholder="Lugar de nacimiento"
              value={form.birthPlace}
              onChange={(e) => setForm({ ...form, birthPlace: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#201f1d]">
              Consumo mensual declarado
            </span>

            <div className="relative mt-2">
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-12 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                type="number"
                placeholder="30"
                value={form.consumptionGrams}
                onChange={(e) =>
                  setForm({
                    ...form,
                    consumptionGrams: e.target.value,
                  })
                }
              />

              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-black text-[#6d6860]">
                g
              </span>
            </div>
          </label>
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-[2rem] border border-[#b4a78d]/30 bg-[#f7f4ee]">
        <div className="border-b border-[#b4a78d]/20 px-5 py-4 sm:px-6">
          <div className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#6d6860]">
            Comprobación final
          </div>

          <h2 className="mt-1 text-lg font-black text-[#201f1d]">
            Datos que aparecerán en el contrato
          </h2>
        </div>

        <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 sm:p-6">
          <div>
            <dt className="text-xs font-bold text-[#6d6860]">Nombre completo</dt>
            <dd className="mt-1 break-words font-black text-[#201f1d]">
              {form.fullName || "-"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-bold text-[#6d6860]">DNI</dt>
            <dd className="mt-1 break-words font-black text-[#201f1d]">
              {form.dni || "-"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-bold text-[#6d6860]">Teléfono</dt>
            <dd className="mt-1 break-words font-black text-[#201f1d]">
              {form.phone || "-"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-bold text-[#6d6860]">Correo electrónico</dt>
            <dd className="mt-1 break-all font-black text-[#201f1d]">
              {form.email || "-"}
            </dd>
          </div>

          <div className="sm:col-span-2">
            <dt className="text-xs font-bold text-[#6d6860]">Domicilio</dt>
            <dd className="mt-1 break-words font-black text-[#201f1d]">
              {form.address || "-"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-bold text-[#6d6860]">
              Fecha de nacimiento
            </dt>
            <dd className="mt-1 font-black text-[#201f1d]">
              {form.birthDate || "-"}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-bold text-[#6d6860]">
              Consumo mensual declarado
            </dt>
            <dd className="mt-1 font-black text-[#201f1d]">
              {form.consumptionGrams ? `${form.consumptionGrams} g` : "-"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-black/8 bg-white shadow-[0_16px_50px_rgba(32,31,29,0.05)]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#a7282d]">
            Firma
          </div>

          <h2 className="mt-1 text-xl font-black tracking-[-0.02em] text-[#201f1d]">
            Firma dentro del recuadro
          </h2>

          <p className="mt-1 text-sm leading-6 text-[#6d6860]">
            Utiliza el dedo o el lápiz de la tablet. Puedes borrar la firma y
            repetirla antes de confirmar.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <div className="overflow-hidden rounded-[1.5rem] border-2 border-dashed border-[#b4a78d]/55 bg-white">
            <div className="border-b border-[#b4a78d]/20 bg-[#f7f4ee] px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#6d6860]">
                  Área de firma
                </span>

                <span className="text-xs font-semibold text-[#6d6860]">
                  Firma aquí
                </span>
              </div>
            </div>

            <SignatureCanvas
              ref={sigRef}
              penColor="black"
              canvasProps={{
                className:
                  "block h-64 w-full touch-none bg-white sm:h-72",
              }}
            />

            <div className="border-t border-[#b4a78d]/20 bg-[#f7f4ee]/70 px-4 py-2 text-center text-xs text-[#6d6860]">
              Al guardar, esta firma quedará asociada al contrato.
            </div>
          </div>

          <div className="mt-5 rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-4 py-3">
            <p className="text-sm leading-6 text-[#645b4c]">
              Antes de guardar, confirma que has revisado tus datos y el documento
              que vas a firmar.
            </p>
          </div>

          {signatureError ? (
            <div
              role="alert"
              className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3"
            >
              <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-red-700">
                Firma necesaria
              </div>

              <div className="mt-1 text-sm font-semibold text-red-700">
                {signatureError}
              </div>
            </div>
          ) : null}

          {saveError ? (
            <div
              role="alert"
              className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3"
            >
              <div className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-red-700">
                No se pudo guardar la firma
              </div>

              <div className="mt-1 text-sm font-semibold leading-6 text-red-700">
                {saveError}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                sigRef.current?.clear();
                setSignatureError("");
                setSaveError("");
              }}
              disabled={saving}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-black/12 bg-white px-5 py-3 font-black text-[#201f1d] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Borrar firma
            </button>

            <button
              type="button"
              onClick={() => void saveSignature()}
              disabled={saving}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#a7282d] px-6 py-3 font-black text-white transition hover:bg-[#861f23] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  />
                  Guardando firma...
                </span>
              ) : (
                "Confirmar y guardar firma"
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
    </main>
  );
}
