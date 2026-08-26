"use client";

import type {
  InternalSigningSessionData,
  MemberHistoryData,
  PublicSigningSessionData,
} from "@/lib/types";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

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

export default function MemberContractPage() {
  const params = useParams<{ id: string }>();
  const memberId = Number(params.id);
  const validMemberId = Number.isInteger(memberId) && memberId > 0;

  const [session, setSession] =
    useState<InternalSigningSessionData | null>(null);
  const [member, setMember] = useState<MemberHistoryData["member"] | null>(null);
  const [loadingMember, setLoadingMember] = useState(validMemberId);
  const [error, setError] = useState("");

  async function createSession() {
    if (!validMemberId) {
      setError("Socio invalido para crear la sesion de firma");
      return;
    }

    const res = await fetch("/api/signing-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId }),
    });

    const data: unknown = await res.json();

    if (!res.ok) {
      const error =
        data && typeof data === "object" && "error" in data
          ? String(data.error)
          : "No se pudo crear la sesion de firma";
      setError(error);
      return;
    }

    if (!isInternalSigningSessionData(data)) {
      setError(
        "La sesion de firma se creo, pero no devolvio un enlace valido. No se abrira /sign/undefined."
      );
      return;
    }

    setError("");
    setSession(data);
  }

  useEffect(() => {
    if (!validMemberId) {
      return;
    }

    let cancelled = false;

    void fetch(`/api/members/${memberId}/history`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("No se pudieron cargar los datos del socio");
        }

        const data: MemberHistoryData = await res.json();

        if (!cancelled) {
          setMember(data.member);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudieron cargar los datos del socio");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMember(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [memberId, validMemberId]);

  useEffect(() => {
    if (!session?.token || session.status === "SIGNED") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/signing-sessions/${session.token}`);

      if (!res.ok) {
        setError("No se pudo actualizar el estado de la firma");
        clearInterval(interval);
        return;
      }

      const data: PublicSigningSessionData = await res.json();
      setSession((current) =>
        current
          ? {
              ...current,
              ...data,
            }
          : current
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [session?.status, session?.token]);

  const signUrl = session?.signUrl ?? "";
  const summaryMember = member
    ? {
        fullName: member.fullName,
        dni: member.dni,
        phone: member.phone,
        email: member.email,
      }
    : session?.member ?? null;

  return (
    <main>
      <PageHeader
        title="Contrato y firma"
        description="Prepara la sesión de firma y formaliza el contrato del socio."
      />

      <section className="app-panel mb-5 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Contratación
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Datos que se pasarán a firma
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                Comprueba la identidad y los datos de contacto antes de generar la
                sesión de firma.
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                session?.status === "SIGNED"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : session
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]"
              }`}
            >
              {session?.status === "SIGNED"
                ? "CONTRATO FIRMADO"
                : session
                  ? "FIRMA PENDIENTE"
                  : "SIN INICIAR"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loadingMember ? (
            <div className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-4 py-4 text-sm font-semibold text-[#645b4c]">
              Cargando datos del socio...
            </div>
          ) : summaryMember ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Nombre completo
                </div>

                <div className="mt-2 font-black text-[#201f1d]">
                  {summaryMember.fullName || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  DNI / documento
                </div>

                <div className="mt-2 font-black text-[#201f1d]">
                  {summaryMember.dni || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-black/7 bg-white/75 p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Teléfono
                </div>

                <div className="mt-2 break-words font-bold text-[#201f1d]">
                  {summaryMember.phone || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-black/7 bg-white/75 p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Correo electrónico
                </div>

                <div className="mt-2 break-all font-bold text-[#201f1d]">
                  {summaryMember.email || "No indicado"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
              No se han podido obtener los datos del socio.
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            No se pudo completar la operación
          </div>

          <div className="mt-1 text-sm font-semibold text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      {!session && (
        <section className="overflow-hidden rounded-[2rem] border border-black/8 bg-white/82">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Firma
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Preparar contrato
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
              Genera una sesión segura para abrir el contrato en la tablet, móvil u
              otro dispositivo donde firmará el socio.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 rounded-[1.5rem] border border-dashed border-[#b4a78d]/45 bg-[#f7f4ee]/55 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-black text-[#201f1d]">
                  Sesión todavía no iniciada
                </div>

                <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                  Al continuar se seleccionará la plantilla contractual correspondiente
                  y se generará el enlace de firma.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void createSession()}
                disabled={!validMemberId || loadingMember || !summaryMember}
                className="app-button-primary inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Crear sesión de firma
              </button>
            </div>
          </div>
        </section>
      )}
      {session && (
        <div className="space-y-4">
          <div className="rounded border p-4">
            <div className="text-sm text-gray-500">Estado</div>
            <strong>{session.status}</strong>
          </div>

          {session && (
            <div className="space-y-5">
              <section
                className={`overflow-hidden rounded-[2rem] border ${
                  session.status === "SIGNED"
                    ? "border-emerald-200 bg-white/82"
                    : "border-amber-200 bg-white/82"
                }`}
              >
                <div
                  className={`border-b px-5 py-5 sm:px-6 ${
                    session.status === "SIGNED"
                      ? "border-emerald-100 bg-emerald-50/45"
                      : "border-amber-200/70 bg-amber-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`h-[2px] w-6 rounded-full ${
                            session.status === "SIGNED"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />

                        <span
                          className={`text-[0.65rem] font-black uppercase tracking-[0.2em] ${
                            session.status === "SIGNED"
                              ? "text-emerald-700"
                              : "text-amber-800"
                          }`}
                        >
                          {session.status === "SIGNED"
                            ? "Firma completada"
                            : "Sesión activa"}
                        </span>
                      </div>

                      <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                        {session.status === "SIGNED"
                          ? "Contrato firmado"
                          : "Esperando firma del socio"}
                      </h2>

                      <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                        {session.status === "SIGNED"
                          ? "La firma ya ha sido recibida y consta en la sesión contractual."
                          : "Abre el enlace en el dispositivo de firma. Esta pantalla se actualizará automáticamente."}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                        session.status === "SIGNED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {session.status === "SIGNED" ? "FIRMADO" : session.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 p-5 sm:p-6">
                  {session.contractTemplate ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/25 bg-[#f7f4ee]/65">
                      <div className="border-b border-black/7 px-4 py-4 sm:px-5">
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] app-muted">
                          Plantilla contractual
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div>
                          <div className="font-black text-[#201f1d]">
                            {session.contractTemplate.name}
                          </div>

                          <div className="mt-1 text-sm app-muted">
                            Versión {session.contractTemplate.version}
                          </div>
                        </div>

                        <a
                          href={session.contractTemplate.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold sm:w-auto"
                        >
                          Ver contrato PDF
                        </a>
                      </div>
                    </div>
                  ) : null}

                  {session.status !== "SIGNED" ? (
                    <>
                      {signUrl ? (
                        <div className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50/45">
                          <div className="border-b border-amber-200/70 px-4 py-4 sm:px-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="font-black text-[#201f1d]">
                                  Enlace listo para firmar
                                </div>

                                <p className="mt-1 text-sm app-muted">
                                  Utiliza este enlace en la tablet, móvil u otro dispositivo.
                                </p>
                              </div>

                              <div className="flex items-center gap-2 text-xs font-black text-amber-800">
                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
                                ESPERANDO FIRMA
                              </div>
                            </div>
                          </div>

                          <div className="p-4 sm:p-5">
                            <label className="block text-sm font-bold text-[#201f1d]">
                              Enlace de firma

                              <input
                                className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                                value={signUrl}
                                readOnly
                                onFocus={(e) => e.currentTarget.select()}
                              />
                            </label>

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

                            <div className="mt-4 rounded-[1.25rem] border border-[#b4a78d]/25 bg-white/70 px-4 py-3 text-sm leading-6 app-muted">
                              Si la tablet está en la misma red local, utiliza una dirección accesible desde ese dispositivo en lugar de <code>localhost</code>.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
                          Falta el enlace de firma. Crea una nueva sesión antes de abrir la tablet.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/55 p-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 font-black text-emerald-700">
                          ✓
                        </div>

                        <div>
                          <div className="font-black text-[#201f1d]">
                            Firma recibida correctamente
                          </div>

                          <p className="mt-1 text-sm leading-6 text-emerald-700">
                            La sesión se ha actualizado automáticamente y el contrato consta como firmado.
                          </p>
                        </div>
                      </div>

                      {session.signatureImage ? (
                        <div className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white">
                          <div className="border-b border-black/7 px-4 py-3 sm:px-5">
                            <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] app-muted">
                              Firma del socio
                            </div>
                          </div>

                          <div className="flex min-h-[220px] items-center justify-center bg-[#f7f4ee]/55 p-5">
                            <Image
                              src={session.signatureImage}
                              alt="Firma del socio"
                              width={420}
                              height={210}
                              unoptimized
                              className="max-h-[210px] max-w-full object-contain"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                          El contrato consta como firmado, pero la imagen de la firma no está disponible.
                        </div>
                      )}

                      <div className="flex flex-col gap-2 border-t border-black/7 pt-4 sm:flex-row sm:justify-end">
                        <a
                          href={`/members/${memberId}`}
                          className="app-button-primary inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-3 font-bold"
                        >
                          Volver al expediente
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {session.status === "SIGNED" && (
            <div className="rounded border bg-green-50 p-4">
              <h2 className="mb-3 font-bold text-green-700">Contrato firmado</h2>

              {session.signatureImage && (
                <Image
                  src={session.signatureImage}
                  alt="Firma"
                  width={384}
                  height={192}
                  unoptimized
                  className="max-w-sm rounded border bg-white p-2"
                />
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
