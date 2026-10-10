import type { MemberOverviewDTO } from "@/lib/dtos/member-overview";
import type { ReactNode } from "react";

type Props = { overview: MemberOverviewDTO | null; loading: boolean; error: string; onRetry: () => void };
function Indicator({ title, children }: { title: string; children: ReactNode }) {
  return <article className="min-w-0 rounded-2xl border border-black/8 bg-white/80 p-4 [overflow-wrap:anywhere]">
    <h4 className="text-xs font-bold uppercase tracking-wide app-muted">{title}</h4>
    <div className="mt-2 space-y-1 text-sm">{children}</div>
  </article>;
}
const dateText = (value: string) => new Date(value).toLocaleDateString("es-ES");

export function MemberOperationalSummary({ overview, loading, error, onRetry }: Props) {
  const ready = !loading && !error ? overview : null;
  return <section aria-labelledby="member-operational-summary" aria-busy={loading} className="min-w-0 border-b border-black/7 bg-[#f7f4ee]/60 p-4 sm:p-6 [overflow-wrap:anywhere]">
    <h3 id="member-operational-summary" className="text-lg font-black">Resumen operativo</h3>
    {loading ? <p role="status" className="mt-3 text-sm app-muted">Cargando resumen operativo…</p>
      : error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
      : !ready ? <p role="status" className="mt-3 text-sm app-muted">Sin datos del resumen operativo.</p> : null}
    {!loading && (error || !ready) && <button type="button" onClick={onRetry} className="app-button-secondary mt-3 min-h-11 max-w-full whitespace-normal rounded-xl px-4 py-2">Reintentar resumen</button>}
    {ready && <>
      <div className="mt-3 rounded-xl border border-black/8 bg-white/60 p-3 text-sm">
        <p className="font-bold">Retirada · elegibilidad básica: {ready.operational.canWithdraw ? "Cumple" : "No cumple"}</p>
        <ul className="mt-1 space-y-1">
          {ready.operational.reasons.inactive && <li>Socio inactivo.</li>}
          {ready.operational.reasons.noContract && <li>Sin contrato firmado.</li>}
          {ready.operational.reasons.expired && <li>Membresía caducada.</li>}
        </ul>
        <p className="mt-2 app-muted">Información operativa. El TPV aplica las comprobaciones de cada venta.</p>
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Indicator title="Membresía">
          <p className="font-bold">{ready.operational.active ? "Activo" : "Inactivo"}{ready.operational.expired && " · Caducada"}</p>
          <p>{ready.operational.expiresAt ? <>Vencimiento: <time dateTime={ready.operational.expiresAt}>{dateText(ready.operational.expiresAt)}</time></> : "Sin vencimiento"}</p>
        </Indicator>
        <Indicator title="Contrato">
          <p className="font-bold">{ready.operational.hasContract ? "Consta contrato firmado" : "Sin contrato firmado"}</p>
          {ready.contract ? <p>Firma: <time dateTime={ready.contract.signedAt}>{dateText(ready.contract.signedAt)}</time></p> : <p>Sin registro de firma.</p>}
        </Indicator>
        <Indicator title="Consumo mensual">
          <p className="font-bold">{ready.consumption.monthlyGrams} g consumidos</p>
          <p>{ready.consumption.monthlyLimitG === null ? "Límite mensual no indicado" : <>Límite mensual: {ready.consumption.monthlyLimitG} g</>}</p>
          <p className="app-muted">Desde {dateText(ready.consumption.periodStart)} hasta {dateText(ready.consumption.periodEndExclusive)} (excluido).</p>
        </Indicator>
        <Indicator title="RFID"><p className="font-bold">{ready.operational.hasRfid ? "Asignado" : "Sin asignar"}</p></Indicator>
        <Indicator title="Documentación">
          <p>DNI frontal: {ready.documentation.hasDniFront ? "Disponible" : "No disponible"}</p>
          <p>DNI reverso: {ready.documentation.hasDniBack ? "Disponible" : "No disponible"}</p>
          <p className="app-muted">Disponibilidad documental; no acredita verificación.</p>
        </Indicator>
        <Indicator title="Último acceso">
          {ready.access.lastEvent ? <><p className="font-bold">Evento: {ready.access.lastEvent.type}</p>
            <time dateTime={ready.access.lastEvent.createdAt}>{new Date(ready.access.lastEvent.createdAt).toLocaleString("es-ES")}</time></> : <p>Sin registros de acceso.</p>}
        </Indicator>
      </div>
    </>}
  </section>;
}
