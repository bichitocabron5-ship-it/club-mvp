"use client";

import type {
  MemberHistoryData,
} from "@/lib/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminSigningPanel } from "@/components/admin-signing-session";
import { PageHeader } from "@/components/ui/page-header";

export default function MemberContractPage() {
  const params = useParams<{ id: string }>();
  const memberId = Number(params.id);
  const validMemberId = Number.isInteger(memberId) && memberId > 0;

  const [member, setMember] = useState<MemberHistoryData["member"] | null>(null);
  const [loadingMember, setLoadingMember] = useState(validMemberId);
  const [error, setError] = useState("");

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

  const summaryMember = member
    ? {
        fullName: member.fullName,
        dni: member.dni,
        phone: member.phone,
        email: member.email,
      }
    : null;

  return (
    <main>
      <PageHeader
        title="Contrato y firma"
        description="Prepara la sesión de firma y formaliza el contrato del socio."
      />

      <section className="app-panel mb-5 overflow-hidden rounded-[2rem]">
        <div className="border-b border-black/7 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                  Contratación
                </span>
              </div>

              <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
                Datos que se pasarán a firma
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
                Comprueba la identidad y los datos de contacto antes de generar la
                sesión de firma.
              </p>
            </div>


          </div>
        </div>

        <div className="p-5 sm:p-6">
          {loadingMember ? (
            <div className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-4 py-4 text-sm font-semibold text-[#645b4c]">
              Cargando datos del socio...
            </div>
          ) : summaryMember ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Nombre completo
                </div>

                <div className="mt-2 font-black text-[#201f1d]">
                  {summaryMember.fullName || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] bg-[#f7f4ee] p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  DNI / documento
                </div>

                <div className="mt-2 font-black text-[#201f1d]">
                  {summaryMember.dni || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-black/7 bg-white/75 p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Teléfono
                </div>

                <div className="mt-2 break-words font-bold text-[#201f1d]">
                  {summaryMember.phone || "No indicado"}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-black/7 bg-white/75 p-4">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.1em] app-muted">
                  Correo electrónico
                </div>

                <div className="mt-2 break-all font-bold text-[#201f1d]">
                  {summaryMember.email || "No indicado"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
              No se han podido obtener los datos del socio.
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="mb-5 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-700">
            No se pudo completar la operación
          </div>

          <div className="mt-1 text-sm font-semibold text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      {validMemberId && <AdminSigningPanel key={memberId} memberId={memberId} showDocument />}
    </main>
  );
}
