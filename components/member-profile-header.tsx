import type { ReactNode } from "react";

export type MemberProfileHeaderProps = {
  memberId: number | string;
  memberNumber: number | string | null | undefined;
  fullName: string;
  photo: ReactNode;
  operational: {
    member: { active: boolean; expiresAt: string | null };
    expired: boolean;
    hasContract: boolean;
  } | null;
  loading: boolean;
  error: string;
  hasRfid: boolean | null;
  editing: boolean;
  onToggleEdit: () => void;
  onRetry: () => void;
};

// The page owns data, permissions and mutations; this component only presents them.
export function MemberProfileHeader({
  memberId, memberNumber, fullName, photo, operational, loading, error,
  hasRfid, editing, onToggleEdit, onRetry,
}: MemberProfileHeaderProps) {
  const actionClass = "inline-flex min-h-12 min-w-0 items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a7282d]";
  return (
    <header className="border-b border-black/7 p-4 sm:p-6">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#a7282d]">Expediente</p>
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_13rem]">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <p className="text-sm font-semibold app-muted [overflow-wrap:anywhere]">Socio nº {memberNumber ?? memberId}</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#201f1d] [overflow-wrap:anywhere] md:text-3xl">{fullName}</h2>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black [overflow-wrap:anywhere]">
            {operational && <>
              <span className={`max-w-full rounded-full border px-3 py-1 ${operational.member.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {operational.member.active ? "ACTIVO" : "BLOQUEADO"}
              </span>
              {operational.expired && <span className="max-w-full rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">MEMBRESÍA CADUCADA</span>}
              <span className={`max-w-full rounded-full border px-3 py-1 ${operational.hasContract ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                {operational.hasContract ? "CONTRATO" : "SIN CONTRATO"}
              </span>
            </>}
            {hasRfid !== null && <span className={`max-w-full rounded-full border px-3 py-1 ${hasRfid ? "border-[#b4a78d]/30 bg-[#f3f0e9] text-[#645b4c]" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {hasRfid ? "RFID ASIGNADO" : "RFID PENDIENTE"}
            </span>}
          </div>
          {operational && <p className={`mt-4 text-sm font-semibold ${operational.expired ? "text-red-700" : "app-muted"}`}>
            Vencimiento: {operational.member.expiresAt
              ? <time dateTime={operational.member.expiresAt}>{new Date(operational.member.expiresAt).toLocaleDateString("es-ES")}</time>
              : "Sin vencimiento"}
          </p>}
          {loading && <p role="status" className="mt-3 text-sm app-muted">{operational ? "Actualizando estado operativo..." : "Cargando estado operativo..."}</p>}
          {error && <div role="alert" className="mt-3 text-sm text-red-700 [overflow-wrap:anywhere]">
            <p>{error}{operational && " Se muestra el último estado confirmado."}</p>
            <button type="button" onClick={onRetry} className="app-button-secondary mt-2 min-h-11 rounded-xl px-4 py-2 font-bold">Reintentar</button>
          </div>}
        </div>
        <div className="min-w-0 md:col-start-1 md:row-start-1">{photo}</div>
        <nav aria-label="Acciones del socio" className="grid min-w-0 grid-cols-1 gap-2 self-start sm:grid-cols-2 md:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:grid-cols-1">
          <button type="button" onClick={onToggleEdit} aria-expanded={editing} className={`app-button-primary ${actionClass}`}>{editing ? "Editando socio" : "Editar socio"}</button>
          <a href={`/members/${memberId}/contract`} className={`app-button-secondary ${actionClass}`}>Contrato / Firma</a>
          <a href="/sales" className={`app-button-secondary ${actionClass}`}>Ir al TPV</a>
          <a href="#member-history" className={`app-button-secondary ${actionClass}`}>Ver historial</a>
        </nav>
      </div>
    </header>
  );
}
