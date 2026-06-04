"use client";

import type {
  InternalSigningSessionData,
  MemberHistoryData,
  PublicSigningSessionData,
} from "@/lib/types";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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
      <h1 className="mb-4 text-2xl font-bold">Contrato y firma</h1>

      <section className="mb-4 rounded border bg-gray-50 p-4">
        <h2 className="mb-3 font-bold">Datos que se pasarán a firma</h2>

        {loadingMember && <p className="text-sm text-gray-500">Cargando socio...</p>}

        {!loadingMember && summaryMember && (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-gray-500">Nombre</div>
              <strong>{summaryMember.fullName || "-"}</strong>
            </div>
            <div>
              <div className="text-gray-500">DNI</div>
              <strong>{summaryMember.dni || "-"}</strong>
            </div>
            <div>
              <div className="text-gray-500">Teléfono</div>
              <strong>{summaryMember.phone || "No indicado"}</strong>
            </div>
            <div>
              <div className="text-gray-500">Email</div>
              <strong>{summaryMember.email || "No indicado"}</strong>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!session && (
        <button
          onClick={createSession}
          className="rounded bg-blue-600 p-4 font-bold text-white"
        >
          Crear sesión de firma
        </button>
      )}

      {session && (
        <div className="space-y-4">
          <div className="rounded border p-4">
            <div className="text-sm text-gray-500">Estado</div>
            <strong>{session.status}</strong>
          </div>

          {session.status !== "SIGNED" && (
            <div className="rounded border p-4">
              {session.contractTemplate && (
                <div className="mb-3 rounded bg-gray-50 p-3 text-sm">
                  Contrato real: <strong>{session.contractTemplate.name}</strong>{" "}
                  v{session.contractTemplate.version}.{" "}
                  <a
                    href={session.contractTemplate.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Ver PDF
                  </a>
                </div>
              )}
              <p className="mb-2 font-semibold">Abre este enlace en la tablet:</p>
              {signUrl ? (
                <input
                  className="w-full border p-2"
                  value={signUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
              ) : (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700">
                  Falta el enlace de firma. Crea una nueva sesion antes de
                  abrir la tablet.
                </div>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Si la tablet está en la misma red, usa la IP local del ordenador
                en lugar de localhost.
              </p>
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
