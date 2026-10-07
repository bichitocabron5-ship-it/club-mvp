"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { MEMBER_DOCUMENT_TYPE_VALUES, type MemberDocumentListItem, type MemberDocumentListResponse } from "@/lib/types";
import { MemberDocumentItem } from "@/components/member-document-item";

type Props = {
  memberId: number | string;
  initialFrontUrl: string | null;
  initialBackUrl: string | null;
  canUpload?: boolean;
};
type Side = "front" | "back";
const labels = ["DNI frontal", "DNI reverso", "Autorización", "Justificante", "Anexo", "Otro"];
const rejected: Record<string, string> = {
  DOCUMENT_TOO_LARGE: "La imagen supera el máximo de 5 MiB.",
  REQUEST_TOO_LARGE: "La imagen supera el máximo de 5 MiB.",
  UNSUPPORTED_MIME: "Selecciona una imagen JPG, PNG o WEBP.",
  INVALID_DOCUMENT_BYTES: "El archivo no es una imagen válida.",
  DOCUMENT_EMPTY: "Selecciona una imagen que no esté vacía.",
  UNAUTHORIZED: "La sesión ha caducado. Inicia sesión de nuevo.",
  FORBIDDEN: "No tienes permiso para incorporar documentos.",
};

async function loadCurrent(
  memberId: number | string,
  generation: RefObject<number>,
  controller: RefObject<AbortController | null>,
  mounted: RefObject<boolean>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<boolean>>,
  setItems: Dispatch<SetStateAction<MemberDocumentListItem[] | null>>,
) {
  const version = ++generation.current;
  controller.current?.abort();
  const request = new AbortController();
  controller.current = request;
  const active = () => mounted.current && generation.current === version;
  setLoading(true);
  setError(false);
  try {
    const response = await fetch(`/api/members/${memberId}/member-documents?view=current`, {
      cache: "no-store", signal: request.signal,
    });
    if (!response.ok) throw new Error("List unavailable");
    const result: MemberDocumentListResponse = await response.json();
    if (!Array.isArray(result.items)) throw new Error("Invalid list");
    if (!active()) return false;
    setItems(result.items);
    return true;
  } catch {
    if (active()) setError(true);
    return false;
  } finally {
    if (active()) setLoading(false);
  }
}

// A member change remounts all local state, including pending upload callbacks.
export function MemberDocumentsCard(props: Props) {
  return <CurrentDocuments key={String(props.memberId)} {...props} />;
}

function CurrentDocuments({ memberId, initialFrontUrl, initialBackUrl, canUpload = false }: Props) {
  const [items, setItems] = useState<MemberDocumentListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState<Side | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const uploadLock = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<MemberDocumentListItem[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "error" | "loaded">("idle");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState(false);
  const historyRequested = useRef(false);
  const historyGeneration = useRef(0);
  const historyController = useRef<AbortController | null>(null);
  const historyLock = useRef(false);

  async function loadHistory(cursor: string | null = null, reset = false) {
    if (!mounted.current || (historyLock.current && !reset)) return;
    historyRequested.current = true;
    historyLock.current = true;
    const version = ++historyGeneration.current;
    historyController.current?.abort();
    const request = new AbortController();
    historyController.current = request;
    const active = () => mounted.current && historyGeneration.current === version;
    if (cursor === null) {
      setHistoryItems([]);
      setNextCursor(null);
      setHistoryStatus("loading");
    }
    setPageLoading(cursor !== null);
    setPageError(false);
    const query = new URLSearchParams({ view: "all", limit: "20" });
    if (cursor !== null) query.set("cursor", cursor);
    try {
      const response = await fetch(`/api/members/${memberId}/member-documents?${query}`, {
        cache: "no-store", signal: request.signal,
      });
      if (!response.ok) throw new Error("History unavailable");
      const result: MemberDocumentListResponse = await response.json();
      if (!Array.isArray(result.items) || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("Invalid history");
      if (!active()) return;
      setHistoryItems(previous => {
        const merged = cursor === null ? result.items : [...previous, ...result.items];
        const seen = new Set<number>();
        return merged.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setNextCursor(result.nextCursor);
      setHistoryStatus("loaded");
    } catch {
      if (!active()) return;
      if (cursor === null) setHistoryStatus("error");
      else setPageError(true);
    } finally {
      if (active()) {
        historyLock.current = false;
        setPageLoading(false);
      }
    }
  }

  const refresh = useCallback(() => loadCurrent(
    memberId, generation, controller, mounted, setLoading, setError, setItems,
  ), [memberId]);

  useEffect(() => {
    // This ref owns the latest request, not a DOM node; abort that request on cleanup.
    const requests = controller;
    const historyRequests = historyController;
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      generation.current += 1;
      requests.current?.abort();
      historyGeneration.current += 1;
      historyRequests.current?.abort();
    };
  }, [refresh]);

  async function upload(side: Side, file: File) {
    if (uploadLock.current || !canUpload || !mounted.current) return;
    uploadLock.current = true;
    setUploading(side);
    setNotice(null);
    const form = new FormData();
    form.set("side", side);
    form.set("image", file);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/members/${memberId}/dni`, { method: "POST", body: form });
      } catch {
        if (mounted.current) setNotice({ error: true, text: "No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir." });
        return;
      }
      if (!mounted.current) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (mounted.current) setNotice({ error: true, text: rejected[payload?.error] ??
          (response.status >= 500 ? "No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir." : "No se pudo incorporar el documento. Revisa el archivo y tus permisos.") });
        return;
      }
      // HTTP success confirms the write; the adapter URL is not a visual source.
      setNotice({ error: false, text: "Documento incorporado." });
      if (historyRequested.current) void loadHistory(null, true);
      const refreshed = await refresh();
      if (mounted.current && !refreshed) setNotice({ error: true, text: "Documento incorporado. No se pudo actualizar el listado." });
    } finally {
      uploadLock.current = false;
      if (mounted.current) setUploading(null);
    }
  }

  const front = items?.some(item => item.type === "ID_FRONT");
  const back = items?.some(item => item.type === "ID_BACK");
  const legacy = items !== null && ((!front && initialFrontUrl) || (!back && initialBackUrl));
  return (
    <section className="app-panel mt-6 rounded-[2rem] p-4 sm:p-6" aria-busy={loading || uploading !== null}>
      <h2 className="text-xl font-black">Expediente documental</h2>
      <h3 className="mt-4 font-bold">Documentación actual</h3>
      <p className="mt-2 text-sm app-muted">Actual indica el último documento incorporado de cada tipo. No implica validación ni obligatoriedad.</p>
      {loading && <p role="status" className="mt-4">Cargando documentación…</p>}
      {error && <p role="alert" className="mt-4">No se pudo cargar la documentación.{items !== null && " Se muestran los últimos datos cargados."}</p>}
      <button type="button" className="app-button-secondary mt-3 min-h-11 px-4" disabled={loading || uploading !== null} onClick={() => { void refresh(); }}>
        {error ? "Reintentar" : "Actualizar documentación"}
      </button>
      {items !== null && <>
        {!loading && !error && items.length === 0 && <p className="mt-4">No hay documentos incorporados al expediente.</p>}
        {!loading && !error && (front || back) && <p className="mt-4 font-semibold">{front && back ? "DNI: ambas caras adjuntadas" : "DNI: una cara adjuntada"}</p>}
        {!loading && !error && legacy && <p className="mt-4 text-sm">Hay un DNI de compatibilidad que todavía no está incorporado al expediente.</p>}
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
          {MEMBER_DOCUMENT_TYPE_VALUES.map((type, index) => {
            const item = items.find(document => document.type === type);
            const side = type === "ID_FRONT" ? "front" : type === "ID_BACK" ? "back" : null;
            return <article key={type} className="min-w-0 rounded-2xl border border-black/10 p-4">
              <h4 className="font-bold">{labels[index]}</h4>
              {item ? <MemberDocumentItem key={`${memberId}:${item.id}`} memberId={memberId} item={item} label={labels[index]} /> : !loading && !error && <p className="mt-2 app-muted">Sin documento incorporado</p>}
              {side && canUpload && <div className="mt-4">
                <label className="block text-sm font-semibold" htmlFor={`dni-${memberId}-${side}`}>Incorporar imagen de {labels[index]}</label>
                <p id={`dni-help-${memberId}-${side}`} className="text-sm app-muted">JPG, PNG o WEBP, hasta 5 MiB. Se conservarán los documentos anteriores.</p>
                <input id={`dni-${memberId}-${side}`} aria-describedby={`dni-help-${memberId}-${side}`} type="file" accept=".jpg,.jpeg,.png,.webp" disabled={uploading !== null}
                  className="mt-2 block w-full min-w-0 text-sm" onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(side, file);
                  }} />
                {uploading === side && <p role="status">Incorporando imagen de {labels[index]}…</p>}
              </div>}
            </article>;
          })}
        </div>
      </>}
      <h3 className="mt-6 font-bold">Histórico documental</h3>
      <button type="button" className="app-button-secondary mt-3 min-h-11 px-4"
        aria-expanded={historyOpen} aria-controls={`document-history-${memberId}`} onClick={() => {
          setHistoryOpen(!historyOpen);
          if (!historyOpen && !historyRequested.current) void loadHistory();
        }}>{historyOpen ? "Cerrar histórico" : "Ver histórico"}</button>
      <div id={`document-history-${memberId}`} hidden={!historyOpen} aria-busy={historyStatus === "loading" || pageLoading}>
        {historyStatus === "loading" && <p role="status" className="mt-3">Cargando histórico documental…</p>}
        {historyStatus === "error" && <div className="mt-3">
          <p role="alert">No se pudo cargar el histórico documental.</p>
          <button type="button" className="app-button-secondary min-h-11 px-4" onClick={() => { void loadHistory(); }}>Reintentar</button>
        </div>}
        {historyStatus === "loaded" && historyItems.length === 0 && <p className="mt-3">El histórico documental está vacío.</p>}
        <ul className="mt-3 grid min-w-0 gap-3">
          {historyItems.map(item => {
            const label = labels[MEMBER_DOCUMENT_TYPE_VALUES.indexOf(item.type)];
            const current = items !== null && !loading && !error ? items.some(document => document.id === item.id) : item.isCurrent;
            return <li key={item.id} className="min-w-0 rounded-xl border border-black/10 p-3">
              <h4 className="font-bold">{label}</h4>
              <p className="text-sm">{current ? "Actual · último incorporado" : "Versión anterior"}</p>
              <MemberDocumentItem memberId={memberId} item={item} label={label} compact />
            </li>;
          })}
        </ul>
        {pageError && <p role="alert" className="mt-3">No se pudieron cargar más documentos.</p>}
        {nextCursor !== null && <button type="button" className="app-button-secondary mt-3 min-h-11 px-4" disabled={pageLoading}
          onClick={() => { void loadHistory(nextCursor); }}>{pageError ? "Reintentar" : "Cargar más"}</button>}
        {pageLoading && <p role="status">Cargando más documentos…</p>}
      </div>
      {notice && <p className="mt-4" role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    </section>
  );
}
