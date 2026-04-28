// app/members/[id]/contract/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function MemberContractPage() {
  const params = useParams();
  const memberId = Number(params.id);

  const [session, setSession] = useState<any>(null);

  async function createSession() {
    const res = await fetch("/api/signing-sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId }),
    });

    const data = await res.json();
    setSession(data);
  }

  useEffect(() => {
    if (!session?.token || session.status === "SIGNED") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/signing-sessions/${session.token}`);
      const data = await res.json();
      setSession(data);
    }, 2000);

    return () => clearInterval(interval);
  }, [session?.token, session?.status]);

  const signUrl =
    session && `${window.location.origin}/sign/${session.token}`;

  return (
    <main>
      <h1 className="text-2xl font-bold mb-4">Contrato y firma</h1>

      {!session && (
        <button
          onClick={createSession}
          className="rounded bg-blue-600 p-4 text-white font-bold"
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
              <p className="mb-2 font-semibold">Abre este enlace en la tablet:</p>
              <input
                className="w-full border p-2"
                value={signUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className="mt-2 text-sm text-gray-500">
                Si la tablet está en la misma red, usa la IP local del ordenador
                en lugar de localhost.
              </p>
            </div>
          )}

          {session.status === "SIGNED" && (
            <div className="rounded border bg-green-50 p-4">
              <h2 className="font-bold text-green-700 mb-3">
                Contrato firmado
              </h2>

              {session.signatureImage && (
                <img
                  src={session.signatureImage}
                  alt="Firma"
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