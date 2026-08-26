// app/members/[id]/page.tsx
"use client";

import { MemberDocumentsCard } from "@/components/member-documents-card";
import { MemberPhotoCard } from "@/components/member-photo-card";
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
import { PageHeader } from "@/components/ui/page-header";

export default function MemberDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const canUploadPhoto =
    session?.user?.role === "ADMIN" || session?.user?.role === "STAFF";

  const [data, setData] = useState<MemberHistoryData | null>(null);
  const [contracts, setContracts] = useState<MemberContractRecord[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [assigningRfid, setAssigningRfid] = useState(false);
  const [rfidMessage, setRfidMessage] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [rfidProcessing, setRfidProcessing] = useState(false);
  const [savingContractId, setSavingContractId] = useState<number | null>(null);
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

    const contractsRes = await fetch(`/api/members/${id}/contracts`, {
      cache: "no-store",
    });

    if (contractsRes.ok) {
      const contractsData: MemberContractRecord[] = await contractsRes.json();
      setContracts(contractsData);
    }
  }

  async function updateContractMonthlyLimit(
    contractId: number,
    currentValue: number | null
  ) {
    const nextValue = prompt(
      "Nuevo límite mensual en gramos. Deja vacío para quitarlo.",
      currentValue !== null ? String(currentValue) : ""
    );

    if (nextValue === null) return;

    const trimmed = nextValue.trim();
    const payload =
      trimmed === ""
        ? { consumptionGrams: null }
        : { consumptionGrams: Number(trimmed) };

    if (
      payload.consumptionGrams !== null &&
      (!Number.isInteger(payload.consumptionGrams) || payload.consumptionGrams <= 0)
    ) {
      alert("Introduce un número entero mayor que 0");
      return;
    }

    setSavingContractId(contractId);

    const res = await fetch(`/api/contracts/${contractId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setSavingContractId(null);

    if (!res.ok) {
      const err: { error?: string } = await res.json();
      alert(err.error || "No se pudo actualizar el límite mensual");
      return;
    }

    await refreshMember();
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
  const membershipExpired =
    Boolean(data.member.expiresAt) &&
    new Date(data.member.expiresAt as string) < new Date();

  const membershipValid =
    Boolean(data.member.expiresAt) && !membershipExpired;

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
      <PageHeader
        title="Ficha del socio"
        description="Identificación, membresía, documentación y actividad del socio."
      />

      {data.member && (
        <section className="app-panel mb-5 overflow-hidden rounded-[2rem]">
          <div className="border-b border-black/7 px-5 py-5 sm:px-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />
              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Expediente
              </span>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <MemberPhotoCard
                memberId={id}
                initialPhotoUrl={data.member.photoUrl}
                canUpload={Boolean(authReady && canUploadPhoto)}
                onUploaded={refreshMember}
              />

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold app-muted">
                  Socio nº {visibleMemberNumber}
                </div>

                <h2 className="mt-1 break-words text-2xl font-black tracking-[-0.03em] text-[#201f1d] md:text-3xl">
                  {data.member.fullName}
                </h2>

                <div className="mt-2 break-words text-sm app-muted">
                  DNI {data.member.dni}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-black ${
                      data.member.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {data.member.active ? "ACTIVO" : "BLOQUEADO"}
                  </span>

                  {membershipExpired ? (
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                      MEMBRESÍA CADUCADA
                    </span>
                  ) : membershipValid ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      VÁLIDA HASTA{" "}
                      {new Date(data.member.expiresAt as string).toLocaleDateString("es-ES")}
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                      SIN VENCIMIENTO
                    </span>
                  )}

                  {data.member.rfidCode ? (
                    <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-xs font-black text-[#645b4c]">
                      RFID ASIGNADO
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                      RFID PENDIENTE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">

          <div className="rounded-[1.75rem] border border-black/8 bg-white/88 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                Datos personales
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-[#f7f4ee] p-4">
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Teléfono
                </div>

                <div className="mt-2 break-words font-black text-[#201f1d]">
                  {data.member.phone || "No indicado"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#f7f4ee] p-4">
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Correo electrónico
                </div>

                <div className="mt-2 break-words font-black text-[#201f1d]">
                  {data.member.email || "No indicado"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#f7f4ee] p-4">
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Fecha de alta
                </div>

                <div className="mt-2 font-black text-[#201f1d]">
                  {data.member.joinedAt
                    ? new Date(data.member.joinedAt).toLocaleDateString("es-ES")
                    : "Sin fecha"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#f7f4ee] p-4">
                <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                  Vencimiento
                </div>

                <div
                  className={`mt-2 font-black ${
                    data.member.expiresAt &&
                    new Date(data.member.expiresAt) < new Date()
                      ? "text-red-700"
                      : "text-[#201f1d]"
                  }`}
                >
                  {data.member.expiresAt
                    ? new Date(data.member.expiresAt).toLocaleDateString("es-ES")
                    : "Sin vencimiento"}
                </div>
              </div>
            </div>
          </div>

          {authReady && isAdmin && (
            <section className="mt-4 overflow-hidden rounded-[1.75rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/75">
              <div className="border-b border-black/7 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-[2px] w-6 rounded-full bg-[#b4a78d]" />

                      <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                        Perfil comercial
                      </span>
                    </div>

                    <h3 className="font-black text-[#201f1d]">
                      Condiciones aplicadas
                    </h3>

                    <p className="mt-1 text-sm app-muted">
                      Perfil interno, descuento y observaciones comerciales del socio.
                    </p>
                  </div>

                  <span className="rounded-full bg-[#0b0b0c] px-3 py-1.5 text-xs font-black text-[#b4a78d]">
                    {data.member.commercialProfile}
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.25rem] bg-white/80 p-4">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Perfil
                    </div>

                    <div className="mt-2 text-lg font-black text-[#201f1d]">
                      {data.member.commercialProfile}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-[#a7282d]/15 bg-[#a7282d]/5 p-4">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                      Descuento
                    </div>

                    <div className="mt-2 text-lg font-black text-[#861f23]">
                      {Number(data.member.discountPercent || 0).toLocaleString("es-ES", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                      %
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-black/7 bg-white/70 p-4">
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                    Notas comerciales
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#201f1d]">
                    {data.member.commercialNotes || "Sin notas comerciales"}
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-black/8 bg-white/75">
            <div className="border-b border-black/7 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Operaciones
                </span>
              </div>

              <h3 className="mt-2 font-black text-[#201f1d]">
                Acciones del socio
              </h3>

              <p className="mt-1 text-sm app-muted">
                Accede a contrato, ventas, historial o edición del expediente.
              </p>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <a
                  href={`/members/${id}/contract`}
                  className="app-button-primary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                >
                  Contrato / Firma
                </a>

                <a
                  href="/sales"
                  className="app-button-secondary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                >
                  Ir al TPV
                </a>

                <a
                  href="#member-history"
                  className="app-button-secondary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                >
                  Ver historial
                </a>

                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold ${
                    editing
                      ? "border border-[#a7282d]/20 bg-[#a7282d]/8 text-[#861f23]"
                      : "bg-[#0b0b0c] text-white hover:bg-[#171719]"
                  }`}
                >
                  {editing ? "Editando socio" : "Editar socio"}
                </button>
              </div>

              {authReady && isAdmin ? (
                <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70">
                  <div className="border-b border-[#b4a78d]/20 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

                      <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#6d6860]">
                        Administración
                      </span>
                    </div>

                    <h4 className="mt-2 font-black text-[#201f1d]">
                      Estado de membresía
                    </h4>

                    <p className="mt-1 text-sm app-muted">
                      Estas acciones modifican la situación operativa del socio.
                    </p>
                  </div>

                  <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {data.member.active ? (
                      <button
                        type="button"
                        onClick={() => updateMemberStatus({ active: false })}
                        className="app-button-danger inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold"
                      >
                        Bloquear socio
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateMemberStatus({ active: true })}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        Activar socio
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => updateMemberStatus({ renewOneYear: true })}
                      className="app-button-primary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold"
                    >
                      Renovar 1 año
                    </button>

                    <button
                      type="button"
                      onClick={() => updateMemberStatus({ clearExpiration: true })}
                      className="app-button-secondary inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold"
                    >
                      Quitar vencimiento
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {editing && (
            <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[#a7282d]/15 bg-white/88">
              <div className="border-b border-black/7 bg-[#f7f4ee]/70 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                  <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                    Edición
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                  Editar socio
                </h2>

                <p className="mt-1 text-sm app-muted">
                  Modifica los datos del expediente y guarda los cambios al finalizar.
                </p>
              </div>

              <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
                <label className="block text-sm font-bold text-[#201f1d]">
                  Número de socio

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    placeholder="Número de socio"
                    value={editForm.memberNumber}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        memberNumber: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Nombre completo

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    placeholder="Nombre y apellidos"
                    value={editForm.fullName}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        fullName: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  DNI / documento

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    placeholder="Documento de identidad"
                    value={editForm.dni}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        dni: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Teléfono

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    placeholder="Teléfono"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Correo electrónico

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        email: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="block text-sm font-bold text-[#201f1d]">
                  Fecha de vencimiento

                  <input
                    className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                    type="date"
                    value={editForm.expiresAt}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        expiresAt: e.target.value,
                      })
                    }
                  />

                  <span className="mt-2 block text-xs font-normal app-muted">
                    Puedes dejarla vacía si la membresía no tiene vencimiento.
                  </span>
                </label>

                {authReady && isAdmin && (
                  <div className="md:col-span-2">
                    <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70">
                      <div className="border-b border-black/7 px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-2">
                          <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

                          <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#6d6860]">
                            Perfil comercial
                          </span>
                        </div>

                        <h3 className="mt-2 font-black text-[#201f1d]">
                          Condiciones comerciales
                        </h3>

                        <p className="mt-1 text-sm app-muted">
                          Define el perfil interno, el descuento y las observaciones aplicables al socio.
                        </p>
                      </div>

                      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
                        <label className="block text-sm font-bold text-[#201f1d]">
                          Perfil

                          <select
                            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                            value={editForm.commercialProfile}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                commercialProfile: e.target.value,
                              })
                            }
                          >
                            <option value="STANDARD">Estándar</option>
                            <option value="VIP">VIP</option>
                            <option value="STAFF">Staff</option>
                          </select>
                        </label>

                        <label className="block text-sm font-bold text-[#201f1d]">
                          Descuento

                          <div className="relative mt-2">
                            <input
                              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 pr-10 outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              placeholder="0"
                              value={editForm.discountPercent}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  discountPercent: e.target.value,
                                })
                              }
                            />

                            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold app-muted">
                              %
                            </span>
                          </div>
                        </label>

                        <label className="block text-sm font-bold text-[#201f1d] md:col-span-2">
                          Notas comerciales

                          <textarea
                            className="mt-2 min-h-24 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none placeholder:text-black/35 focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                            placeholder="Condiciones especiales, observaciones comerciales..."
                            value={editForm.commercialNotes}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                commercialNotes: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

              <div className="md:col-span-2">
                <div className="overflow-hidden rounded-[1.5rem] border border-[#b4a78d]/30 bg-[#f7f4ee]/70">
                  <div className="border-b border-black/7 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

                          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#6d6860]">
                            Identificación RFID
                          </span>
                        </div>

                        <h3 className="font-black text-[#201f1d]">
                          Chapita del socio
                        </h3>

                        <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                          El RFID identifica al socio en los procesos de acceso y operativa del club.
                          Puedes introducirlo manualmente o leer una chapita física.
                        </p>
                      </div>

                      {editForm.rfidCode ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                          RFID ASIGNADO
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
                          RFID PENDIENTE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 p-4 sm:p-5">
                    <div>
                      <label
                        htmlFor="member-rfid-code"
                        className="mb-2 block text-sm font-bold text-[#201f1d]"
                      >
                        Código RFID
                      </label>

                      <input
                        id="member-rfid-code"
                        className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 font-mono outline-none focus:border-[#a7282d]/40 focus:ring-4 focus:ring-[#a7282d]/8"
                        placeholder="Código de la chapita"
                        value={editForm.rfidCode}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            rfidCode: e.target.value,
                          })
                        }
                      />

                      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 app-muted">
                          Puedes escribir o pegar manualmente el identificador.
                        </p>

                        {editForm.rfidCode ? (
                          <span className="font-mono text-xs font-bold tracking-[0.08em] text-[#645b4c]">
                            {normalizeRfidCode(editForm.rfidCode)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {rfidMessage && (
                      <div
                        role="status"
                        className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-black"
                          >
                            ✓
                          </span>

                          <span className="font-semibold">{rfidMessage}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setRfidMessage("")}
                          className="app-button-secondary rounded-full px-3 py-1.5 text-xs font-bold"
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
                      className="inline-flex w-full items-center justify-center rounded-xl bg-[#0b0b0c] px-4 py-3 font-bold text-white transition hover:bg-[#171719] sm:w-auto"
                    >
                      {editForm.rfidCode ? "Cambiar chapita RFID" : "Asignar chapita RFID"}
                    </button>

                    {assigningRfid && (
                      <form
                        className="rounded-[1.25rem] border border-[#a7282d]/20 bg-white/85 p-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveScannedRfid(rfidInput);
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-black text-[#201f1d]">
                              Lector RFID preparado
                            </div>

                            <p className="mt-1 max-w-xl text-sm leading-6 app-muted">
                              Acerca la chapita al lector. Cuando el lector envíe el código y pulse Enter,
                              se asignará automáticamente al socio.
                            </p>
                          </div>

                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            Esperando lectura
                          </span>
                        </div>

                        <input
                          ref={rfidRef}
                          autoFocus
                          className="mt-4 w-full rounded-xl border border-[#a7282d]/35 bg-white px-4 py-3 font-mono outline-none ring-4 ring-[#a7282d]/5 focus:border-[#a7282d]/60 focus:ring-[#a7282d]/10"
                          placeholder="Esperando código RFID..."
                          value={rfidInput}
                          onChange={(e) => setRfidInput(e.target.value)}
                          disabled={rfidProcessing}
                        />

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs app-muted">
                            Mantén este campo activo hasta completar la lectura.
                          </p>

                          <button
                            type="button"
                            onClick={() => {
                              setAssigningRfid(false);
                              setRfidInput("");
                            }}
                            className="app-button-secondary rounded-full px-3 py-1.5 text-xs font-bold"
                          >
                            Cancelar lectura
                          </button>
                        </div>

                        {rfidProcessing && (
                          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#861f23]">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#a7282d]/25 border-t-[#a7282d]" />
                            Guardando RFID...
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-black/7 pt-5 md:col-span-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="app-button-secondary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold sm:w-auto"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={saveMember}
                  className="app-button-primary inline-flex w-full items-center justify-center rounded-xl px-5 py-3 font-bold sm:w-auto"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </section>
      )}

      <MemberDocumentsCard
        memberId={id}
        initialFrontUrl={data.member.dniFrontUrl}
        initialBackUrl={data.member.dniBackUrl}
        onUploaded={refreshMember}
      />

      <section className="app-panel mt-6 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Contratos
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Contratos firmados
              </h2>

              <p className="mt-1 text-sm app-muted">
                Histórico contractual y documentación firmada del socio.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {contracts.length} contrato{contracts.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {contracts.length === 0 ? (
            <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
              <div className="font-black text-[#201f1d]">
                No hay contratos firmados
              </div>

              <p className="mt-2 text-sm app-muted">
                Cuando el socio firme un contrato aparecerá aquí.
              </p>
            </div>
          ) : (
            contracts.map((contract) => (
              <article
                key={contract.id}
                className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/88"
              >
                <div className="border-b border-black/7 bg-[#f7f4ee]/55 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-[2px] w-5 rounded-full bg-emerald-500" />

                        <span className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-emerald-700">
                          Contrato firmado
                        </span>
                      </div>

                      <div className="font-black text-[#201f1d]">
                        {new Date(contract.signedAt).toLocaleString("es-ES")}
                      </div>

                      {contract.contractTemplate ? (
                        <div className="mt-1 text-sm app-muted">
                          {contract.contractTemplate.name} · versión{" "}
                          {contract.contractTemplate.version}
                        </div>
                      ) : null}
                    </div>

                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      FIRMADO
                    </span>
                  </div>
                </div>

                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                      <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                        Titular
                      </div>

                      <div className="mt-1 font-black text-[#201f1d]">
                        {contract.fullName}
                      </div>
                    </div>

                    <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                      <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                        Documento
                      </div>

                      <div className="mt-1 font-black text-[#201f1d]">
                        {contract.dni}
                      </div>
                    </div>
                  </div>

                  {(contract.phone || contract.email) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-[#f7f4ee] p-4">
                        <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                          Teléfono
                        </div>

                        <div className="mt-1 font-semibold">
                          {contract.phone || "No indicado"}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#f7f4ee] p-4">
                        <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                          Email
                        </div>

                        <div className="mt-1 break-words font-semibold">
                          {contract.email || "No indicado"}
                        </div>
                      </div>
                    </div>
                  )}

                  {(contract.address ||
                    contract.birthPlace ||
                    contract.birthDate) && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-black/7 bg-white p-4">
                        <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                          Domicilio
                        </div>

                        <div className="mt-1 text-sm font-semibold">
                          {contract.address || "No indicado"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-black/7 bg-white p-4">
                        <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                          Lugar de nacimiento
                        </div>

                        <div className="mt-1 text-sm font-semibold">
                          {contract.birthPlace || "No indicado"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-black/7 bg-white p-4">
                        <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                          Fecha de nacimiento
                        </div>

                        <div className="mt-1 text-sm font-semibold">
                          {contract.birthDate
                            ? new Date(contract.birthDate).toLocaleDateString("es-ES")
                            : "No indicada"}
                        </div>
                      </div>
                    </div>
                  )}

                  {contract.consumptionGrams !== null ? (
                    <div className="rounded-2xl border border-[#b4a78d]/25 bg-[#f7f4ee] p-4">
                      <div className="text-xs font-black uppercase tracking-[0.1em] app-muted">
                        Límite mensual
                      </div>

                      <div className="mt-1 text-xl font-black text-[#861f23]">
                        {contract.consumptionGrams} g
                      </div>
                    </div>
                  ) : null}

                  {contract.signatureImage ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-white">
                      <div className="border-b border-black/7 px-4 py-3">
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                          Firma del socio
                        </div>
                      </div>

                      <div className="flex min-h-[180px] items-center justify-center bg-[#f7f4ee]/50 p-4">
                        <Image
                          src={contract.signatureImage}
                          alt={`Firma de ${contract.fullName}`}
                          width={360}
                          height={180}
                          unoptimized
                          className="max-h-[180px] max-w-full object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      Firma no disponible.
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-black/7 pt-4 sm:flex-row sm:flex-wrap">
                    {contract.signedPdfUrl ? (
                      <a
                        href={contract.signedPdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="app-button-primary inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold"
                      >
                        Ver contrato firmado
                      </a>
                    ) : null}

                    <a
                      href={`/api/contracts/${contract.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl bg-[#0b0b0c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#171719]"
                    >
                      Regenerar PDF
                    </a>

                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          void updateContractMonthlyLimit(
                            contract.id,
                            contract.consumptionGrams,
                          );
                        }}
                        disabled={savingContractId === contract.id}
                        className="app-button-secondary rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-40"
                      >
                        {savingContractId === contract.id
                          ? "Guardando..."
                          : "Editar límite mensual"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        id="member-history"
        className="app-panel mt-6 overflow-hidden rounded-[2rem]"
      >
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Operativa
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Historial de actividad
              </h2>

              <p className="mt-1 text-sm app-muted">
                Accesos y retiradas registradas para este socio.
              </p>
            </div>

            <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1.5 text-xs font-bold text-[#6d6860]">
              {accessLogs.length} acceso
              {accessLogs.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
              <div className="absolute inset-y-0 left-0 w-[3px] bg-[#b4a78d]" />

              <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
                Accesos
              </div>

              <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
                {accessLogs.length}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-white/90 p-4">
              <div className="absolute inset-y-0 left-0 w-[3px] bg-[#a7282d]" />

              <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
                Retiradas
              </div>

              <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#201f1d]">
                {data.count}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]/90 p-4">
              <div className="absolute inset-y-0 left-0 w-[3px] bg-[#0b0b0c]" />

              <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] app-muted">
                Total acumulado
              </div>

              <div className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#861f23]">
                {Number(data.totalSpent).toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                })}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

              <h3 className="font-black text-[#201f1d]">
                Accesos al club
              </h3>
            </div>

            {accessLogs.length === 0 ? (
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                <div className="font-black text-[#201f1d]">
                  Sin accesos registrados
                </div>

                <p className="mt-2 text-sm app-muted">
                  Las entradas y salidas del socio aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {accessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-3 rounded-[1.25rem] border border-black/8 bg-white/88 p-3.5 transition-all hover:border-[#b4a78d]/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      {log.type === "IN" ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Entrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-xs font-bold text-[#645b4c]">
                          <span className="h-2 w-2 rounded-full bg-[#b4a78d]" />
                          Salida
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold app-muted">
                      {new Date(log.createdAt).toLocaleString("es-ES")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="my-6 h-px bg-black/7" />

          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[2px] w-5 rounded-full bg-[#a7282d]" />

              <h3 className="font-black text-[#201f1d]">
                Historial de retiradas
              </h3>
            </div>

            {data.sales.length === 0 ? (
              <div className="rounded-[1.5rem] border border-black/8 bg-white/70 p-6 text-center">
                <div className="font-black text-[#201f1d]">
                  Sin retiradas registradas
                </div>

                <p className="mt-2 text-sm app-muted">
                  Las operaciones realizadas por el socio aparecerán aquí.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.sales.map((sale, index) => {
                  const cancelled = Boolean(sale.cancelledAt);

                  return (
                    <article
                      key={sale.id}
                      className={`overflow-hidden rounded-[1.5rem] border transition-all ${
                        cancelled
                          ? "border-black/8 bg-[#f7f4ee]/65 opacity-80"
                          : "border-black/8 hover:border-[#a7282d]/20 hover:shadow-[0_8px_24px_rgba(22,20,18,0.05)]"
                      }`}
                    >
                      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-[#0b0b0c] px-2 text-xs font-black text-[#b4a78d]">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4
                                className={`break-words font-black ${
                                  cancelled
                                    ? "text-[#6d6860]"
                                    : "text-[#201f1d]"
                                }`}
                              >
                                {sale.product.name}
                              </h4>

                              {cancelled ? (
                                <span className="app-badge app-badge-danger rounded-full px-3 py-1 text-xs">
                                  ANULADA
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm app-muted">
                              <span>
                                {sale.qty} {sale.product.unit}
                              </span>

                              <span>
                                Operación #{sale.id}
                              </span>
                            </div>

                            {sale.discountAmount > 0 ? (
                              <div className="mt-3 rounded-xl border border-[#b4a78d]/25 bg-[#f7f4ee] px-3 py-2">
                                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                                  Descuento aplicado
                                </div>

                                <div className="mt-1 text-sm text-[#645b4c]">
                                  {sale.discountReason || "Sin motivo indicado"} ·{" "}
                                  <span className="font-black text-[#861f23]">
                                    -
                                    {Number(sale.discountAmount).toLocaleString("es-ES", {
                                      style: "currency",
                                      currency: "EUR",
                                    })}
                                  </span>
                                </div>
                              </div>
                            ) : null}

                            {cancelled && sale.cancelReason ? (
                              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                                <span className="font-bold">
                                  Motivo de anulación:
                                </span>{" "}
                                {sale.cancelReason}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 border-t border-black/7 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0 md:text-right">
                          <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
                            Importe
                          </div>

                          <div
                            className={`mt-1 text-xl font-black ${
                              cancelled
                                ? "text-[#6d6860] line-through"
                                : "text-[#861f23]"
                            }`}
                          >
                            {Number(sale.totalAmount).toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </div>

                          {sale.originalAmount !== null &&
                          Number(sale.originalAmount) !==
                            Number(sale.totalAmount) ? (
                            <div className="mt-1 text-xs app-muted line-through">
                              {Number(sale.originalAmount).toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </div>
                          ) : null}

                          <div className="mt-2 text-xs app-muted">
                            {new Date(sale.createdAt).toLocaleString("es-ES")}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
