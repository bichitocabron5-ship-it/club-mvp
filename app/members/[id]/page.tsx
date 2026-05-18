// app/members/[id]/page.tsx
"use client";

import type {
  AccessLogRecord,
  MemberContractRecord,
  MemberHistoryData,
} from "@/lib/types";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function MemberDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [data, setData] = useState<MemberHistoryData | null>(null);
  const [contracts, setContracts] = useState<MemberContractRecord[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [assigningRfid, setAssigningRfid] = useState(false);
  const [rfidMessage, setRfidMessage] = useState("");

  const [editForm, setEditForm] = useState({
    fullName: "",
    dni: "",
    phone: "",
    email: "",
    expiresAt: "",
    rfidCode: "",
    commercialProfile: "STANDARD",
    discountPercent: "0",
    commercialNotes: "",
  });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    void Promise.all([
      fetch(`/api/members/${id}/contracts`),
      fetch(`/api/members/${id}/history`),
      fetch(`/api/members/${id}/access-logs`),
    ]).then(async ([contractsRes, historyRes, accessRes]) => {
      const contractsData: MemberContractRecord[] = await contractsRes.json();
      const historyData: MemberHistoryData = await historyRes.json();
      const accessData: AccessLogRecord[] = await accessRes.json();

      if (!cancelled) {
        setContracts(contractsData);
        setData(historyData);
        setAccessLogs(accessData);

        if (historyData.member) {
          setEditForm({
            fullName: historyData.member.fullName || "",
            dni: historyData.member.dni || "",
            phone: historyData.member.phone || "",
            email: historyData.member.email || "",
            expiresAt: historyData.member.expiresAt
              ? historyData.member.expiresAt.slice(0, 10)
              : "",
            rfidCode: historyData.member.rfidCode || "",
            commercialProfile: historyData.member.commercialProfile || "STANDARD",
            discountPercent: String(historyData.member.discountPercent ?? 0),
            commercialNotes: historyData.member.commercialNotes || "",
          });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!rfidMessage) return;

    const timeout = setTimeout(() => setRfidMessage(""), 4000);
    return () => clearTimeout(timeout);
  }, [rfidMessage]);

  if (!data) return <div>Cargando...</div>;

  const authReady = status !== "loading";
  const visibleMemberNumber = data.member.memberNumber ?? data.member.id;

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

  async function saveMember() {
    const res = await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...editForm,
        discountPercent:
          editForm.discountPercent === ""
            ? 0
            : Number(editForm.discountPercent),
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Error actualizando socio");
      return;
    }

    setEditing(false);
    window.location.reload();
  }

  async function saveScannedRfid(code: string) {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    const res = await fetch(`/api/members/${id}`, {
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

    setEditForm((current) => ({ ...current, rfidCode: cleanCode }));
    setAssigningRfid(false);
    setRfidMessage(`Chapita asignada correctamente: ${cleanCode}`);
  }

  return (
    <main>
      <h1 className="mb-4 text-xl font-bold">Ficha del socio</h1>

      {data.member && (
        <div className="mb-4 rounded border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-gray-500">Número de socio</div>
              <div className="text-2xl font-semibold">
                Nº socio provisional {visibleMemberNumber}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">Datos personales</div>
              <div className="font-semibold">{data.member.fullName}</div>
              <div className="text-sm text-gray-700">{data.member.dni}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded border bg-gray-50 p-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-gray-500">Teléfono</div>
              <div className="font-medium">{data.member.phone || "No indicado"}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Email</div>
              <div className="font-medium">{data.member.email || "No indicado"}</div>
            </div>
          </div>

          <div className="mt-4">
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

              {data.member.rfidCode ? (
                <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                  RFID {data.member.rfidCode}
                </span>
              ) : (
                <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                  RFID pendiente
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-500">
            Alta:{" "}
            {data.member.joinedAt
              ? new Date(data.member.joinedAt).toLocaleDateString()
              : "Sin fecha"}
          </div>

          <div className="mt-4 rounded border bg-gray-50 p-4">
            <div className="mb-2 text-sm text-gray-500">Perfil comercial</div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded bg-gray-900 px-3 py-1 text-white">
                {data.member.commercialProfile}
              </span>

              <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
                {Number(data.member.discountPercent || 0).toFixed(2)}% descuento
              </span>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              {data.member.commercialNotes || "Sin notas comerciales"}
            </div>
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

            <button
              onClick={() => setEditing(!editing)}
              className="rounded bg-gray-900 px-4 py-2 text-white"
            >
              {editing ? "Cancelar" : "Editar socio"}
            </button>
          </div>

          {editing && (
            <div className="mt-4 space-y-3 rounded border p-4">
              <h2 className="font-bold">Editar socio</h2>

              <input
                className="w-full border p-2"
                placeholder="Nombre"
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm({ ...editForm, fullName: e.target.value })
                }
              />

              <input
                className="w-full border p-2"
                placeholder="DNI"
                value={editForm.dni}
                onChange={(e) =>
                  setEditForm({ ...editForm, dni: e.target.value })
                }
              />

              <input
                className="w-full border p-2"
                placeholder="Teléfono"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
              />

              <input
                className="w-full border p-2"
                placeholder="Email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
              />

              <input
                className="w-full border p-2"
                type="date"
                value={editForm.expiresAt}
                onChange={(e) =>
                  setEditForm({ ...editForm, expiresAt: e.target.value })
                }
              />

              <input
                className="w-full border p-2"
                placeholder="RFID"
                value={editForm.rfidCode}
                onChange={(e) =>
                  setEditForm({ ...editForm, rfidCode: e.target.value })
                }
              />

              {authReady && isAdmin && (
                <>
                  <div className="border-t pt-3">
                    <h3 className="font-semibold">Perfil comercial</h3>
                  </div>

                  <select
                    className="w-full border p-2"
                    value={editForm.commercialProfile}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        commercialProfile: e.target.value,
                      })
                    }
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="VIP">VIP</option>
                    <option value="STAFF">STAFF</option>
                  </select>

                  <input
                    className="w-full border p-2"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="Descuento %"
                    value={editForm.discountPercent}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        discountPercent: e.target.value,
                      })
                    }
                  />

                  <textarea
                    className="w-full border p-2"
                    rows={3}
                    placeholder="Notas comerciales"
                    value={editForm.commercialNotes}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        commercialNotes: e.target.value,
                      })
                    }
                  />
                </>
              )}

              {rfidMessage && (
                <div className="flex items-center justify-between gap-3 rounded border border-green-200 bg-green-50 p-3 text-green-700">
                  <span>{rfidMessage}</span>
                  <button
                    type="button"
                    onClick={() => setRfidMessage("")}
                    className="rounded border border-green-300 px-3 py-1 text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setAssigningRfid(true)}
                className="w-full rounded bg-gray-900 p-3 font-bold text-white"
              >
                Asignar RFID escaneando
              </button>

              {assigningRfid && (
                <input
                  autoFocus
                  className="w-full border border-blue-500 p-3"
                  placeholder="Pasa la chapita ahora..."
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    if (value) {
                      void saveScannedRfid(value);
                    }
                  }}
                />
              )}

              <button
                onClick={() => {
                  void saveMember();
                }}
                className="w-full rounded bg-blue-600 p-3 font-bold text-white"
              >
                Guardar cambios
              </button>
            </div>
          )}
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

              {(contract.phone || contract.email) && (
                <div className="mt-2 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                  <div>Teléfono: {contract.phone || "No indicado"}</div>
                  <div>Email: {contract.email || "No indicado"}</div>
                </div>
              )}

              {(contract.address || contract.birthPlace || contract.birthDate) && (
                <div className="mt-2 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                  <div>Domicilio: {contract.address || "No indicado"}</div>
                  <div>Lugar de nacimiento: {contract.birthPlace || "No indicado"}</div>
                  <div>
                    Fecha de nacimiento:{" "}
                    {contract.birthDate
                      ? new Date(contract.birthDate).toLocaleDateString()
                      : "No indicada"}
                  </div>
                </div>
              )}

              {contract.consumptionGrams && (
                <div className="mt-2 text-sm">
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

      <div className="mt-6">
        <h2 className="mb-3 text-xl font-bold">Historial de accesos</h2>

        {accessLogs.length === 0 && (
          <p className="text-gray-500">No hay accesos registrados.</p>
        )}

        <div className="space-y-2">
          {accessLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded border p-3"
            >
              <div>
                <span
                  className={
                    log.type === "IN"
                      ? "rounded bg-green-100 px-3 py-1 text-green-700"
                      : "rounded bg-blue-100 px-3 py-1 text-blue-700"
                  }
                >
                  {log.type === "IN" ? "Entrada" : "Salida"}
                </span>
              </div>

              <div className="text-sm text-gray-500">
                {new Date(log.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 mt-6 grid grid-cols-2 gap-2">
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
              {sale.discountAmount > 0 && (
                <div className="text-xs text-blue-700">
                  {sale.discountReason}: -{Number(sale.discountAmount).toFixed(2)} EUR
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="font-semibold">
                {Number(sale.totalAmount).toFixed(2)} EUR
              </div>
              {sale.originalAmount !== null &&
                Number(sale.originalAmount) !== Number(sale.totalAmount) && (
                  <div className="text-xs text-gray-500 line-through">
                    {Number(sale.originalAmount).toFixed(2)} EUR
                  </div>
                )}
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
