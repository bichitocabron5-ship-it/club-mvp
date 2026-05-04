"use client";

import type { MemberContractRecord, MemberHistoryData } from "@/lib/types";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function MemberDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<MemberHistoryData | null>(null);
  const [contracts, setContracts] = useState<MemberContractRecord[]>([]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    void Promise.all([
      fetch(`/api/members/${id}/contracts`),
      fetch(`/api/members/${id}/history`),
    ]).then(async ([contractsRes, historyRes]) => {
      const contractsData: MemberContractRecord[] = await contractsRes.json();
      const historyData: MemberHistoryData = await historyRes.json();

      if (!cancelled) {
        setContracts(contractsData);
        setData(historyData);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!data) return <div>Cargando...</div>;

  type MemberStatusPayload = {
    active?: boolean;
    renewOneYear?: boolean;
    clearExpiration?: boolean;
  };

  async function updateMemberStatus(payload: MemberStatusPayload) {
    const res = await fetch(`/api/members/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      alert("Error actualizando socio");
      return;
    }

    const historyRes = await fetch(`/api/members/${id}/history`);
    const historyData: MemberHistoryData = await historyRes.json();
    setData(historyData);
  }

  return (
    <main>
      <h1 className="mb-4 text-xl font-bold">Historial del socio</h1>

      {data.member && (
        <div className="mb-4 rounded border p-4">
          <div className="mb-2 text-sm text-gray-500">Estado del socio</div>

          <div className="flex flex-wrap gap-2">
            <span
              className={
                data.member.active
                  ? "rounded bg-green-100 px-3 py-1 text-green-700"
                  : "rounded bg-red-100 px-3 py-1 text-red-700"
              }
            >
            {data.member.active ? "Activo" : "Bloqueado"}
            </span>

            {data.member.expiresAt && new Date(data.member.expiresAt) < new Date() && (
              <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                Membresía caducada
              </span>
            )}

            {data.member.expiresAt && new Date(data.member.expiresAt) >= new Date() && (
              <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                Válido hasta {new Date(data.member.expiresAt).toLocaleDateString()}
              </span>
            )}

            {!data.member.expiresAt && (
              <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                Sin fecha de vencimiento
              </span>
            )}
          </div>

          <div className="mt-3 text-sm text-gray-500">
            Alta:{" "}
            {data.member.joinedAt
              ? new Date(data.member.joinedAt).toLocaleDateString()
              : "Sin fecha"}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {data.member.active ? (
              <button
                onClick={() => updateMemberStatus({ active: false })}
                className="rounded bg-red-600 px-4 py-2 text-white"
              >
                Bloquear socio
              </button>
            ) : (
              <button
                onClick={() => updateMemberStatus({ active: true })}
                className="rounded bg-green-600 px-4 py-2 text-white"
              >
                Activar socio
              </button>
            )}

            <button
              onClick={() => updateMemberStatus({ renewOneYear: true })}
              className="rounded bg-blue-600 px-4 py-2 text-white"
            >
              Renovar 1 año
            </button>

            <button
              onClick={() => updateMemberStatus({ clearExpiration: true })}
              className="rounded border px-4 py-2"
            >
              Quitar vencimiento
            </button>
          </div>

        </div>
      )}

      <a
        href={`/members/${id}/contract`}
        className="mb-4 inline-block rounded bg-blue-600 px-4 py-2 text-white"
      >
        Contrato / Firma
      </a>

      <div className="mt-6">
        <h2 className="mb-3 text-xl font-bold">Contratos firmados</h2>

        {contracts.length === 0 && (
          <p className="text-gray-500">No hay contratos firmados.</p>
        )}

        <div className="space-y-4">
          {contracts.map((contract) => (
            <div key={contract.id} className="rounded border bg-gray-50 p-4">
              <div className="text-sm text-gray-500">
                Firmado el {new Date(contract.signedAt).toLocaleString()}
              </div>

              <div className="mt-2">
                <strong>{contract.fullName}</strong> - {contract.dni}
              </div>

              {contract.consumptionGrams && (
                <div className="text-sm">
                  Consumo mensual: {contract.consumptionGrams}g
                </div>
              )}

              {contract.signatureImage && (
                <Image
                  src={contract.signatureImage}
                  alt="Firma"
                  width={320}
                  height={160}
                  unoptimized
                  className="mt-3 max-w-xs border bg-white p-2"
                />
              )}

              {contract.signedPdfUrl && (
                <a
                  href={contract.signedPdfUrl}
                  target="_blank"
                  className="ml-2 mt-3 inline-block rounded bg-green-600 px-4 py-2 text-white"
                  rel="noreferrer"
                >
                  Abrir PDF guardado
                </a>
              )}

              <a
                href={`/api/contracts/${contract.id}/pdf`}
                target="_blank"
                className="mt-3 inline-block rounded bg-blue-600 px-4 py-2 text-white"
                rel="noreferrer"
              >
                Ver PDF firmado
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Retiradas</div>
          <strong>{data.count}</strong>
        </div>

        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Total</div>
          <strong>{Number(data.totalSpent).toFixed(2)} EUR</strong>
        </div>
      </div>

      <div className="space-y-2">
        {data.sales.map((sale) => (
          <div key={sale.id} className="flex justify-between rounded border p-3">
            <div>
              <div>{sale.product.name}</div>
              <div className="text-sm text-gray-500">
                {sale.qty} {sale.product.unit}
              </div>
            </div>

            <div className="text-right">
              <div className="font-semibold">
                {Number(sale.totalAmount).toFixed(2)} EUR
              </div>
              <div className="text-xs text-gray-500">
                {new Date(sale.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
