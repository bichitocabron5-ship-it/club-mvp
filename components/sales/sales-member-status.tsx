import type { MemberOperationalStatus } from "@/lib/helpers/sales-cart";

export function SalesMemberStatus({
  loading,
  memberStatus,
}: {
  loading: boolean;
  memberStatus: MemberOperationalStatus | null;
}) {
  if (loading) {
    return (
      <div className="app-panel rounded-3xl p-4 text-sm">
        <div className="font-semibold">Cargando estado del socio...</div>
      </div>
    );
  }

  if (!memberStatus) {
    return null;
  }

  return (
    <div className="app-panel rounded-3xl p-4 text-sm">
      <div className="mb-2 font-semibold">Estado del socio</div>

      <div className="flex flex-wrap gap-2">
        {memberStatus.member.active ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Activo
          </span>
        ) : (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
            Bloqueado
          </span>
        )}

        {memberStatus.hasContract ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Contrato firmado
          </span>
        ) : (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
            Sin contrato
          </span>
        )}

        {memberStatus.expired ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
            Membresía caducada
          </span>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Membresía vigente
          </span>
        )}

        <span className="rounded-full bg-[#0b0b0c] px-3 py-1 text-white">
          {memberStatus.member.commercialProfile}
        </span>

        <span className="rounded-full border border-[#b4a78d]/30 bg-[#f3f0e9] px-3 py-1 text-[#645b4c]">
          {Number(memberStatus.member.discountPercent || 0).toFixed(2)}%
          descuento
        </span>

        {memberStatus.contract?.monthlyLimitG !== null ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
            Mensual {memberStatus.contract?.monthlyLimitG} g
          </span>
        ) : null}
      </div>

      {!memberStatus.canWithdraw && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-red-700">
          Este socio no puede realizar retiradas.
        </div>
      )}
    </div>
  );
}
