"use client";

import type { SigningSessionData } from "@/lib/types";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function MemberContractPage() {
  const params = useParams<{ id: string }>();
  const memberId = Number(params.id);

  const [session, setSession] = useState<SigningSessionData | null>(null);
  const [error, setError] = useState("");

  async function createSession() {
    const res = await fetch("/api/signing-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "No se pudo crear la sesiÃ³n de firma");
      return;
    }

    setError("");
    setSession(data);
  }

  useEffect(() => {
    if (!session?.token || session.status === "SIGNED") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/signing-sessions/${session.token}`);
      const data: SigningSessionData = await res.json();
      setSession(data);
    }, 2000);

    return () => clearInterval(interval);
  }, [session?.status, session?.token]);

  const signUrl =
    session ? `${window.location.origin}/sign/${session.token}` : "";

  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">Contrato y firma</h1>

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
          Crear sesion de firma
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
              <input
                className="w-full border p-2"
                value={signUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className="mt-2 text-sm text-gray-500">
                Si la tablet esta en la misma red, usa la IP local del ordenador
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
