"use client";

import { useEffect, useRef, useState } from "react";
import { createSigningController, normalizeSession, type SigningState } from "@/lib/admin-signing-session";

export const signingLabels = { PENDING: "Sesión activa — pendiente de firma", EXPIRED: "Sesión caducada", CANCELLED: "Sesión cancelada", SIGNED: "Contrato firmado" };

export function AdminSigningPanel({ memberId, onSigned, showDocument = false }: { memberId: number; onSigned?: (signed: boolean) => void; showDocument?: boolean }) {
  const [state, setState] = useState<SigningState>({ session: null, busy: false, error: "", ready: false });
  const controller = useRef<ReturnType<typeof createSigningController> | null>(null);
  const [copyError, setCopyError] = useState("");
  useEffect(() => {
    const instance = createSigningController(memberId, setState);
    controller.current = instance;
    void instance.recover();
    return () => { instance.dispose(); controller.current = null; };
  }, [memberId]);
  useEffect(() => { onSigned?.(state.session?.status === "SIGNED"); }, [state.session?.status, onSigned]);
  const session = normalizeSession(state.session);
  const live = state.ready && !state.busy && session?.status === "PENDING" && !!session.signUrl;
  return <section className="app-panel mb-5 space-y-4 rounded-[2rem] p-5 sm:p-6" aria-busy={state.busy}>
    <h2 className="text-xl font-black">Contrato y firma</h2>
    <p role="status">{state.busy ? "Actualizando sesión…" : !state.ready ? "Estado pendiente de confirmar" : session ? signingLabels[session.status] : "Sin sesión de firma"}</p>
    {session && <p>{session.status === "EXPIRED" ? "Caducó" : "Caducidad"}: <time dateTime={session.expiresAt}>{new Date(session.expiresAt).toLocaleString("es-ES")}</time></p>}
    {(state.error || copyError) && <p role="alert" className="text-red-700">{state.error || copyError}</p>}
    {live && <div className="space-y-3">
      {showDocument && session.documentUrl && <a className="app-button-secondary inline-flex rounded-xl p-3" href={session.documentUrl} target="_blank" rel="noreferrer"
        onClick={(event) => { if (normalizeSession(session)?.status !== "PENDING") event.preventDefault(); }}>Ver contrato PDF</a>}
      <input aria-label="Enlace de firma" value={session.signUrl!} readOnly className="w-full rounded-xl border p-3" />
      <a className="app-button-primary inline-flex rounded-xl p-3" href={session.signUrl!} target="_blank" rel="noreferrer"
        onClick={(event) => { if (normalizeSession(session)?.status !== "PENDING") event.preventDefault(); }}>Abrir pantalla de firma</a>
      <button type="button" className="app-button-secondary rounded-xl p-3" onClick={async () => {
        if (normalizeSession(session)?.status !== "PENDING") return;
        try { await navigator.clipboard.writeText(session.signUrl!); setCopyError(""); }
        catch { setCopyError("No se pudo copiar el enlace"); }
      }}>Copiar enlace</button>
    </div>}
    <div className="flex flex-wrap gap-3">
      {session?.status !== "SIGNED" && <button type="button" disabled={!state.ready || state.busy} className="app-button-primary rounded-xl p-3 disabled:opacity-50" onClick={() => void controller.current?.mutate("create")}>
        {session ? "Reemitir / generar nueva sesión" : "Crear sesión de firma"}
      </button>}
      {session?.status === "PENDING" && <button type="button" disabled={!state.ready || state.busy} className="app-button-secondary rounded-xl p-3 disabled:opacity-50" onClick={() => void controller.current?.mutate("cancel")}>Cancelar sesión</button>}
      {!state.ready && <button type="button" disabled={state.busy} onClick={() => void controller.current?.recover()}>Actualizar estado</button>}
      {session?.contractPdfUrl && <a className="app-button-secondary rounded-xl p-3" href={session.contractPdfUrl} target="_blank" rel="noreferrer">Ver PDF contractual firmado</a>}
      <a className="app-button-secondary rounded-xl p-3" href={`/members/${memberId}`}>Ver expediente e histórico contractual</a>
    </div>
  </section>;
}
