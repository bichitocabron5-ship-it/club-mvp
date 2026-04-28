// app/sign/[token]/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";

export default function SignPage() {
  const params = useParams();
  const token = params.token as string;

  const sigRef = useRef<SignatureCanvas | null>(null);
  const [session, setSession] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    dni: "",
    address: "",
    birthPlace: "",
    birthDate: "",
    phone: "",
    email: "",
    consumptionGrams: "30",
  });

  useEffect(() => {
    fetch(`/api/signing-sessions/${token}`)
      .then((res) => res.json())
      .then((data) => {
        setSession(data);
        setForm({
          fullName: data.member?.fullName || "",
          dni: data.member?.dni || "",
          address: "",
          birthPlace: "",
          birthDate: "",
          phone: data.member?.phone || "",
          email: "",
          consumptionGrams: "30",
        });
      });
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
      alert("Error al guardar firma");
      return;
    }

    setSaved(true);
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
    <main className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Firma de contrato</h1>

      <div className="mb-4 rounded border bg-gray-50 p-4">
        <p>
          Socio: <strong>{session.member.fullName}</strong>
        </p>
        <p className="text-sm text-gray-500">
          Documento provisional pendiente de PDF oficial.
        </p>
      </div>

      <div className="mb-4 rounded border p-4 space-y-3">
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

      <div className="mb-4 rounded border p-4 text-sm leading-6">
        <h2 className="font-bold mb-2">Contrato provisional</h2>
        <p>
          El socio declara haber leído y aceptado las condiciones internas del
          club. Este texto será sustituido por el PDF oficial del contrato.
        </p>
      </div>

      <div className="rounded border bg-white p-2">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{
            className: "w-full h-64 border bg-white",
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