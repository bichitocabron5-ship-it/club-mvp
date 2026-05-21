// app/members/[id]/page.tsx
"use client";

import { MemberDocumentsCard } from "@/components/member-documents-card";
import { normalizeRfidCode } from "@/lib/rfid";
import type {
  AccessLogRecord,
  MemberContractRecord,
  MemberHistoryData,
} from "@/lib/types";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [rfidInput, setRfidInput] = useState("");
  const [rfidProcessing, setRfidProcessing] = useState(false);
  const rfidRef = useRef<HTMLInputElement | null>(null);

  const [editForm, setEditForm] = useState({
    memberNumber: "",
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

  function focusRfidInput() {
    setTimeout(() => rfidRef.current?.focus(), 0);
  }

  async function refreshMember() {
    if (!id) return;

    const historyRes = await fetch(`/api/members/${id}/history`, {
      cache: "no-store",
    });

    if (!historyRes.ok) {
      throw new Error("No se pudo refrescar el socio");
    }

    const historyData: MemberHistoryData = await historyRes.json();
    setData(historyData);
  }

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    void Promise.all([
      fetch(`/api/members/${id}/contracts`, { cache: "no-store" }),
      fetch(`/api/members/${id}/history`, { cache: "no-store" }),
      fetch(`/api/members/${id}/access-logs`, { cache: "no-store" }),
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
            memberNumber: historyData.member.memberNumber
              ? String(historyData.member.memberNumber)
              : "",
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

  if (!data) return <div className="p-6 app-muted">Cargando...</div>;

  const authReady = status !== "loading";
  const visibleMemberNumber = data.member.memberNumber ?? data.member.id;
  const latestContract = contracts[0] ?? null;

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

    const historyRes = await fetch(`/api/members/${id}/history`, {
      cache: "no-store",
    });
    const historyData: MemberHistoryData = await historyRes.json();
    setData(historyData);
  }

  async function saveMember() {
    const payload: Record<string, string | number> = {
      memberNumber: editForm.memberNumber.trim(),
      fullName: editForm.fullName.trim(),
      dni: editForm.dni.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email.trim(),
      expiresAt: editForm.expiresAt,
    };

    const normalizedRfidCode = normalizeRfidCode(editForm.rfidCode);
    if (normalizedRfidCode) {
      payload.rfidCode = normalizedRfidCode;
    }

    if (isAdmin) {
      payload.commercialProfile = editForm.commercialProfile;
      payload.discountPercent =
        editForm.discountPercent === "" ? 0 : Number(editForm.discountPercent);
      payload.commercialNotes = editForm.commercialNotes.trim();
    }

    const res = await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
    const cleanCode = normalizeRfidCode(code);
    if (!cleanCode || rfidProcessing) {
      focusRfidInput();
      return;
    }

    setRfidProcessing(true);

    try {
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
      setRfidInput("");
      setRfidMessage(`Chapita asignada correctamente: ${cleanCode}`);
    } finally {
      setRfidProcessing(false);
      focusRfidInput();
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <h1 className="mb-6 text-3xl font-black tracking-tight">Ficha del socio</h1>

      {data.member && (
        <div className="app-panel mb-4 rounded-3xl p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-gray-500">Número de socio</div>
              <div className="text-2xl font-semibold">
                N° socio {visibleMemberNumber}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500">Datos personales</div>
              <div className="font-semibold">{data.member.fullName}</div>
              <div className="text-sm text-gray-700">{data.member.dni}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-black/8 bg-gray-50 p-4 md:grid-cols-2">
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
                  Valido hasta {new Date(data.member.expiresAt).toLocaleDateString()}
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
              <span className="rounded-full bg-gray-900 px-3 py-1 text-white">
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

          <div className="mt-4 rounded border bg-gray-50 p-4">
            <div className="mb-2 text-sm text-gray-500">Contrato</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-gray-500">Contrato firmado</div>
                <div className="font-semibold">{latestContract ? "Si" : "No"}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Fecha firma</div>
                <div className="font-semibold">
                  {latestContract
                    ? new Date(latestContract.signedAt).toLocaleString()
                    : "Sin firma"}
                </div>
              </div>
            </div>

            {latestContract?.signedPdfUrl && (
              <a
                href={latestContract.signedPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-full bg-green-600 px-4 py-2 text-white"
              >
                Ver contrato firmado
              </a>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {authReady && isAdmin && (
              <>
                {data.member.active ? (
                  <button
                    onClick={() => updateMemberStatus({ active: false })}
                    className="app-button-danger rounded-full px-4 py-2 text-white"
                  >
                    Bloquear socio
                  </button>
                ) : (
                  <button
                    onClick={() => updateMemberStatus({ active: true })}
                    className="rounded-full bg-green-600 px-4 py-2 text-white"
                  >
                    Activar socio
                  </button>
                )}

                <button
                  onClick={() => updateMemberStatus({ renewOneYear: true })}
                  className="app-button-primary rounded-full px-4 py-2 text-white"
                >
                  Renovar 1 ano
                </button>

                <button
                  onClick={() => updateMemberStatus({ clearExpiration: true })}
                  className="app-button-secondary rounded-full px-4 py-2"
                >
                  Quitar vencimiento
                </button>
              </>
            )}

            <button
              onClick={() => setEditing(!editing)}
              className="rounded-full bg-gray-900 px-4 py-2 text-white"
            >
              {editing ? "Cancelar" : "Editar socio"}
            </button>
          </div>

          {editing && (
            <div className="mt-4 space-y-3 rounded-3xl border border-black/8 bg-white/82 p-4">
              <h2 className="font-bold">Editar socio</h2>

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="Número de socio"
                value={editForm.memberNumber}
                onChange={(e) =>
                  setEditForm({ ...editForm, memberNumber: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="Nombre"
                value={editForm.fullName}
                onChange={(e) =>
                  setEditForm({ ...editForm, fullName: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="DNI"
                value={editForm.dni}
                onChange={(e) =>
                  setEditForm({ ...editForm, dni: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="Teléfono"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="Email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                type="date"
                value={editForm.expiresAt}
                onChange={(e) =>
                  setEditForm({ ...editForm, expiresAt: e.target.value })
                }
              />

              <input
                className="w-full rounded-2xl border border-black/10 bg-white p-3"
                placeholder="Escanea la chapita o pega el código"
                value={editForm.rfidCode}
                onChange={(e) =>
                  setEditForm({ ...editForm, rfidCode: e.target.value })
                }
              />
              <p className="text-sm text-gray-500">
                Escanea la chapita o pega el código.
              </p>

              {authReady && isAdmin && (
                <>
                  <div className="border-t pt-3">
                    <h3 className="font-semibold">Perfil comercial</h3>
                  </div>

                  <select
                    className="w-full rounded-2xl border border-black/10 bg-white p-3"
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
                    className="w-full rounded-2xl border border-black/10 bg-white p-3"
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
                    className="w-full rounded-2xl border border-black/10 bg-white p-3"
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
                    className="app-button-secondary rounded-full px-3 py-1 text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setAssigningRfid(true);
                  setRfidInput("");
                  focusRfidInput();
                }}
                className="rounded-full bg-gray-900 px-4 py-3 font-bold text-white"
              >
                Asignar RFID escaneando
              </button>

              {assigningRfid && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveScannedRfid(rfidInput);
                  }}
                >
                  <input
                    ref={rfidRef}
                    autoFocus
                    className="w-full rounded-2xl border border-blue-500 bg-white p-3"
                    placeholder="Escanea la chapita o pega el código"
                    value={rfidInput}
                    onChange={(e) => setRfidInput(e.target.value)}
                    disabled={rfidProcessing}
                  />
                  <p className="text-sm text-gray-500">
                    Escanea la chapita o pega el código.
                  </p>
                </form>
              )}

              <button
                onClick={() => {
                  void saveMember();
                }}
                className="app-button-primary w-full rounded-2xl p-3 font-bold text-white"
              >
                Guardar cambios
              </button>
            </div>
          )}
        </div>
      )}

      <a
        href={`/members/${id}/contract`}
        className="mb-4 inline-flex rounded-full bg-blue-600 px-4 py-2 text-white"
      >
        Contrato / Firma
      </a>

      <MemberDocumentsCard
        memberId={id}
        initialFrontUrl={data.member.dniFrontUrl}
        initialBackUrl={data.member.dniBackUrl}
        onUploaded={refreshMember}
      />

      <div className="mt-6">
        <h2 className="mb-3 text-xl font-bold">Contratos firmados</h2>

        {contracts.length === 0 && (
          <p className="text-gray-500">No hay contratos firmados.</p>
        )}

        <div className="space-y-4">
          {contracts.map((contract) => (
            <div key={contract.id} className="app-panel rounded-3xl p-4">
              <div className="text-sm text-gray-500">
                Firmado el {new Date(contract.signedAt).toLocaleString()}
              </div>

              <div className="mt-2">
                <strong>{contract.fullName}</strong> - {contract.dni}
              </div>

              {contract.contractTemplate && (
                <div className="mt-2 text-sm text-gray-600">
                  Plantilla: {contract.contractTemplate.name} v
                  {contract.contractTemplate.version}
                </div>
              )}

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
                  className="ml-2 mt-3 inline-block rounded-full bg-green-600 px-4 py-2 text-white"
                  rel="noreferrer"
                >
                  Ver contrato firmado
                </a>
              )}

              <a
                href={`/api/contracts/${contract.id}/pdf`}
                target="_blank"
                className="mt-3 inline-block rounded-full bg-blue-600 px-4 py-2 text-white"
                rel="noreferrer"
              >
                Regenerar PDF firmado
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
              className="app-panel flex items-center justify-between rounded-2xl p-3"
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

      <div className="mb-4 mt-6 grid gap-3 sm:grid-cols-2">
        <div className="app-panel rounded-3xl p-3">
          <div className="text-sm text-gray-500">Retiradas</div>
          <strong>{data.count}</strong>
        </div>

        <div className="app-panel rounded-3xl p-3">
          <div className="text-sm text-gray-500">Total</div>
          <strong>{Number(data.totalSpent).toFixed(2)} EUR</strong>
        </div>
      </div>

      <div className="space-y-2">
        {data.sales.map((sale) => (
          <div
            key={sale.id}
            className="app-panel flex flex-col gap-2 rounded-3xl p-4 md:flex-row md:justify-between"
          >
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
