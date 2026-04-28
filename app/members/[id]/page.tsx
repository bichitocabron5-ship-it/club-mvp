// app/members/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function MemberDetail() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/members/${id}/contracts`)
      .then((res) => res.json())
      .then(setContracts);

    fetch(`/api/members/${id}/history`)
      .then((res) => res.json())
      .then(setData);
  }, [id]);

  if (!data) return <div>Cargando...</div>;

  return (
    <main>
      <h1 className="text-xl font-bold mb-4">Historial del socio</h1>

      <a
        href={`/members/${id}/contract`}
        className="mb-4 inline-block rounded bg-blue-600 px-4 py-2 text-white"
      >
        Contrato / Firma
      </a>

      <div className="mt-6">
        <h2 className="text-xl font-bold mb-3">Contratos firmados</h2>

        {contracts.length === 0 && (
          <p className="text-gray-500">No hay contratos firmados.</p>
        )}

        <div className="space-y-4">
          {contracts.map((c) => (
            <div key={c.id} className="border rounded p-4 bg-gray-50">
              <div className="text-sm text-gray-500">
                Firmado el {new Date(c.signedAt).toLocaleString()}
              </div>

              <div className="mt-2">
                <strong>{c.fullName}</strong> — {c.dni}
              </div>

              {c.consumptionGrams && (
                <div className="text-sm">
                  Consumo mensual: {c.consumptionGrams}g
                </div>
              )}

              {c.signatureImage && (
                <img
                  src={c.signatureImage}
                  alt="Firma"
                  className="mt-3 max-w-xs border bg-white p-2"
                />
              )}
              <a
              href={`/api/contracts/${c.id}/pdf`}
              target="_blank"
              className="mt-3 inline-block rounded bg-blue-600 px-4 py-2 text-white"
            >
              Ver PDF firmado
            </a>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="border p-3 rounded">
          <div className="text-sm text-gray-500">Retiradas</div>
          <strong>{data.count}</strong>
        </div>

        <div className="border p-3 rounded">
          <div className="text-sm text-gray-500">Total</div>
          <strong>{Number(data.totalSpent).toFixed(2)} €</strong>
        </div>
      </div>

      <div className="space-y-2">
        {data.sales.map((s: any) => (
          <div key={s.id} className="border p-3 rounded flex justify-between">
            <div>
              <div>{s.product.name}</div>
              <div className="text-sm text-gray-500">
                {s.qty} {s.product.unit}
              </div>
            </div>

            <div className="text-right">
              <div className="font-semibold">
                {Number(s.totalAmount).toFixed(2)} €
              </div>
              <div className="text-xs text-gray-500">
                {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}