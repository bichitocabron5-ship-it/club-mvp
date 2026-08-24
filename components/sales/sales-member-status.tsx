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
          <span className="rounded bg-green-100 px-3 py-1 text-green-700">
            Activo
          </span>
        ) : (
          <span className="rounded bg-red-100 px-3 py-1 text-red-700">
            Bloqueado
          </span>
        )}

        {memberStatus.hasContract ? (
          <span className="rounded bg-green-100 px-3 py-1 text-green-700">
            Contrato firmado
          </span>
        ) : (
          <span className="rounded bg-red-100 px-3 py-1 text-red-700">
            Sin contrato
          </span>
        )}

        {memberStatus.expired ? (
          <span className="rounded bg-red-100 px-3 py-1 text-red-700">
            Membresía caducada
          </span>
        ) : (
          <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
            Membresía vigente
          </span>
        )}

        <span className="rounded bg-gray-900 px-3 py-1 text-white">
          {memberStatus.member.commercialProfile}
        </span>

        <span className="rounded bg-blue-100 px-3 py-1 text-blue-700">
          {Number(memberStatus.member.discountPercent || 0).toFixed(2)}%
          descuento
        </span>

        {memberStatus.contract?.monthlyLimitG !== null ? (
          <span className="rounded bg-amber-100 px-3 py-1 text-amber-800">
            Mensual {memberStatus.contract?.monthlyLimitG} g
          </span>
        ) : null}
      </div>

      {!memberStatus.canWithdraw && (
        <div className="mt-3 rounded bg-red-100 p-2 text-red-700">
          Este socio no puede realizar retiradas.
        </div>
      )}
    </div>
  );
}
