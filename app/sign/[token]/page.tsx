"use client";

import type { SigningSessionData } from "@/lib/types";
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
  consumptionGrams: "30",
};

export default function SignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const sigRef = useRef<SignatureCanvas | null>(null);
  const [session, setSession] = useState<SigningSessionData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<SignForm>(emptyForm);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    void fetch(`/api/signing-sessions/${token}`).then(async (res) => {
      const data = await res.json();

      if (cancelled) return;

      if (!res.ok) {
        setError(data.error || "La sesión de firma no está disponible");
        return;
      }

      const sessionData = data as SigningSessionData;

      setSession(sessionData);
      setForm({
        fullName: sessionData.member?.fullName || "",
        dni: sessionData.member?.dni || "",
        address: "",
        birthPlace: "",
        birthDate: "",
        phone: sessionData.member?.phone || "",
        email: sessionData.member?.email || "",
        consumptionGrams: "30",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function saveSignature() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      alert("Firma antes de guardar.");
      return;
    }

    const signatureImage = sigRef.current
      .getTrimmedCanvas()
      .toDataURL("image/png");

    const res = await fetch(`/api/signing-sessions/${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signatureImage, form }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error al guardar firma");
      return;
    }

    setSaved(true);
  }

  if (error) {
    return (
      <main className="p-6 text-center">
        <h1 className="text-2xl font-bold text-red-700">Sesión no disponible</h1>
        <p className="mt-2">{error}</p>
      </main>
    );
  }

  if (!session) return <main className="p-6">Cargando...</main>;

  if (saved || session.status === "SIGNED") {
    return (
      <main className="p-6 text-center">
        <h1 className="text-2xl font-bold text-green-700">Firma guardada</h1>
        <p className="mt-2">Puedes devolver la tablet.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-2 text-2xl font-bold">Firma de contrato</h1>

      <div className="mb-4 rounded border bg-gray-50 p-4">
        <p>
          Socio: <strong>{session.member.fullName}</strong>
        </p>
        <p className="text-sm text-gray-600">
          Nº de socio:{" "}
          <strong>{session.member.memberNumber ?? session.member.id}</strong>
        </p>
        <p className="text-sm text-gray-500">
          Vas a firmar la plantilla real activa del contrato.
        </p>
        {session.contractTemplate && (
          <p className="mt-1 text-sm text-gray-700">
            Plantilla: <strong>{session.contractTemplate.name}</strong> v
            {session.contractTemplate.version}
          </p>
        )}
      </div>

      {session.contractTemplate && (
        <div className="mb-4 rounded border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Contrato real a firmar</h2>
              <p className="text-sm text-gray-600">
                Revisa el PDF base antes de confirmar la firma.
              </p>
            </div>

            <a
              href={session.contractTemplate.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir PDF real
            </a>
          </div>

          <iframe
            title="Contrato real"
            src={session.contractTemplate.fileUrl}
            className="mt-4 h-[420px] w-full rounded border"
          />
        </div>
      )}

      <div className="mb-4 space-y-3 rounded border p-4">
        <h2 className="font-bold">Datos del socio</h2>

        <input
          className="w-full border p-3"
          placeholder="Nombre completo"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />

        <input
          className="w-full border p-3"
          placeholder="DNI"
          value={form.dni}
          onChange={(e) => setForm({ ...form, dni: e.target.value })}
        />

        <input
          className="w-full border p-3"
          placeholder="Domicilio"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <input
          className="w-full border p-3"
          placeholder="Lugar de nacimiento"
          value={form.birthPlace}
          onChange={(e) => setForm({ ...form, birthPlace: e.target.value })}
        />

        <input
          className="w-full border p-3"
          type="date"
          value={form.birthDate}
          onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
        />

        <input
          className="w-full border p-3"
          placeholder="Teléfono"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          className="w-full border p-3"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <input
          className="w-full border p-3"
          type="number"
          placeholder="Gramos mensuales"
          value={form.consumptionGrams}
          onChange={(e) => setForm({ ...form, consumptionGrams: e.target.value })}
        />
      </div>

      <div className="mb-4 rounded border bg-gray-50 p-4 text-sm">
        <h2 className="mb-3 font-bold">Resumen de datos que se insertan</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <div>Nombre completo: <strong>{form.fullName || "-"}</strong></div>
          <div>DNI: <strong>{form.dni || "-"}</strong></div>
          <div>Teléfono: <strong>{form.phone || "-"}</strong></div>
          <div>Email: <strong>{form.email || "-"}</strong></div>
          <div>Dirección: <strong>{form.address || "-"}</strong></div>
          <div>Fecha nacimiento: <strong>{form.birthDate || "-"}</strong></div>
          <div>Consumo declarado: <strong>{form.consumptionGrams || "-"}</strong></div>
        </div>
      </div>

      <div className="rounded border bg-white p-2">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{
            className: "h-64 w-full border bg-white",
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => sigRef.current?.clear()}
          className="rounded border p-4 text-lg"
        >
          Borrar
        </button>

        <button
          onClick={saveSignature}
          className="rounded bg-blue-600 p-4 text-lg font-bold text-white"
        >
          Guardar firma
        </button>
      </div>
    </main>
  );
}
