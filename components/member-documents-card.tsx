"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { type MemberDocumentListItem, type MemberDocumentListResponse } from "@/lib/types";
import { MemberDocumentItem } from "@/components/member-document-item";

type Props = {
  memberId: number | string;
  initialFrontUrl: string | null;
  initialBackUrl: string | null;
  canUpload?: boolean;
};
const acceptedMime = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const dniTypes = ["ID_FRONT", "ID_BACK"] as const;
const labels = ["DNI frontal", "DNI reverso"];
const isDni = (item: MemberDocumentListItem) => item.type === "ID_FRONT" || item.type === "ID_BACK";
const rejected: Record<string, string> = {
  INVALID_DOCUMENT_TYPE: "Selecciona un tipo de documento válido.",
  DOCUMENT_TOO_LARGE: "El archivo supera el máximo de 5 MiB.",
  REQUEST_TOO_LARGE: "El archivo supera el máximo de 5 MiB.",
  UNSUPPORTED_MIME: "Selecciona un archivo JPEG, PNG, WEBP o PDF.",
  INVALID_DOCUMENT_BYTES: "El archivo no es una imagen o PDF válido.",
  DOCUMENT_EMPTY: "Selecciona un archivo que no esté vacío.",
  STORAGE_UNAVAILABLE: "El almacenamiento no está disponible. Inténtalo más tarde.",
  PRIVATE_STORAGE_REQUIRED: "El almacenamiento no está disponible. Inténtalo más tarde.",
  STORAGE_UPLOAD_FAILED: "No se pudo guardar el archivo. Inténtalo más tarde.",
  MEMBER_NOT_FOUND: "No se ha encontrado el socio.",
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
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState("");
  const selectedType = useRef("");
  const selectedFile = useRef<File | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const uncertain = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
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
        // Pages are independent snapshots. New explicit markers supersede older
        // evidence; an absent current in this page does not identify a replacement.
        const incoming = new Map(result.items.map(item => [item.id, item]));
        const currentTypes = new Set(result.items.filter(item => item.isCurrent).map(item => item.type));
        const retained = previous.map(item => incoming.get(item.id) ??
          (currentTypes.has(item.type) ? { ...item, isCurrent: false } : item));
        const merged = cursor === null ? result.items : [...retained, ...result.items];
        const seen = new Set<number>();
        return merged.filter(isDni).filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setNextCursor(result.nextCursor);
      setHistoryStatus("loaded");
      return true;
    } catch {
      if (!active()) return;
      if (cursor === null) setHistoryStatus("error");
      else setPageError(true);
      return false;
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

  function chooseType(type: string) {
    if (uploadLock.current) return;
    selectedType.current = type;
    setDocumentType(type);
  }

  async function upload() {
    if (uploadLock.current || !canUpload || !mounted.current) return;
    if (uncertain.current) return;
    const type = selectedType.current;
    const file = selectedFile.current;
    const validation = !dniTypes.some(value => value === type) ? rejected.INVALID_DOCUMENT_TYPE
      : !file ? "Selecciona un archivo."
      : file.size === 0 ? rejected.DOCUMENT_EMPTY
      : file.size > 5 * 1024 * 1024 ? rejected.DOCUMENT_TOO_LARGE
      : !acceptedMime.includes(file.type) ? rejected.UNSUPPORTED_MIME : null;
    if (validation || !file) {
      setNotice({ error: true, text: validation ?? "Selecciona un archivo." });
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setNotice(null);
    const form = new FormData();
    form.set("type", type);
    form.set("file", file);
    try {
      let response: Response;
      try {
        response = await fetch(`/api/members/${memberId}/member-documents`, { method: "POST", body: form });
      } catch {
        uncertain.current = true;
        if (mounted.current) setNeedsRefresh(true);
        if (mounted.current) setNotice({ error: true, text: "No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir." });
        return;
      }
      if (!mounted.current) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        // A generic server/proxy error can follow a committed write. Only
        // explicit pre-write failures are safe to retry without reconciliation.
        if (response.status >= 500 && !["STORAGE_UNAVAILABLE", "PRIVATE_STORAGE_REQUIRED", "STORAGE_UPLOAD_FAILED"].includes(payload?.error)) {
          uncertain.current = true;
          if (mounted.current) setNeedsRefresh(true);
          if (mounted.current) setNotice({ error: true, text: "No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir." });
          return;
        }
        if (mounted.current) setNotice({ error: true, text: rejected[payload?.error] ??
          (response.status === 401 ? rejected.UNAUTHORIZED : response.status === 403 ? rejected.FORBIDDEN : "No se pudo incorporar el documento.") });
        return;
      }
      // HTTP success confirms the write independently of subsequent reads.
      selectedFile.current = null;
      if (fileInput.current) fileInput.current.value = "";
      setNotice({ error: false, text: "Documento incorporado." });
      const historyRefresh = historyRequested.current ? loadHistory(null, true) : Promise.resolve(true);
      const refreshed = await refresh();
      const historyRefreshed = await historyRefresh;
      if (mounted.current && (!refreshed || !historyRefreshed)) setNotice({ error: false, text: "Documento incorporado. No se pudo actualizar el listado." });
    } finally {
      uploadLock.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  const front = items?.some(item => item.type === "ID_FRONT") || Boolean(initialFrontUrl);
  const back = items?.some(item => item.type === "ID_BACK") || Boolean(initialBackUrl);
  return (
    <section className="app-panel mt-6 rounded-[2rem] p-4 sm:p-6" aria-busy={loading || uploading}>
      <h2 className="text-xl font-black">Expediente documental</h2>
      <h3 className="mt-4 font-bold">Documentación actual</h3>
      <p className="mt-2 text-sm app-muted">Actual indica el último documento incorporado de cada tipo. No implica validación ni obligatoriedad.</p>
      {loading && <p role="status" className="mt-4">Cargando documentación…</p>}
      {error && <p role="alert" className="mt-4">No se pudo cargar la documentación.{items !== null && " Se muestran los últimos datos cargados."}</p>}
      <button type="button" className="app-button-secondary mt-3 min-h-11 px-4" disabled={loading || uploading} onClick={async () => {
        const confirmsUncertain = uncertain.current;
        if (await refresh() && mounted.current && confirmsUncertain) { uncertain.current = false; setNeedsRefresh(false); }
      }}>
        {error ? "Reintentar" : "Actualizar documentación"}
      </button>
      {items !== null && <>
        {!loading && !error && !front && !back && <p className="mt-4">No hay documentos incorporados al expediente.</p>}
        {!loading && !error && (front || back) && <p className="mt-4 font-semibold">{front && back ? "DNI: ambas caras disponibles" : "DNI: una cara disponible"}</p>}
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
          {dniTypes.map((type, index) => {
            const item = items.find(document => document.type === type);
            const side = type === "ID_FRONT" ? "front" : "back";
            const legacyAvailable = !item && !loading && !error && Boolean(side === "front" ? initialFrontUrl : initialBackUrl);
            const legacyUrl = `/api/members/${memberId}/documents?side=${side}`;
            return <article key={type} className="min-w-0 rounded-2xl border border-black/10 p-4">
              <h4 className="font-bold">{labels[index]}</h4>
              {item ? <MemberDocumentItem key={`${memberId}:${item.id}`} memberId={memberId} item={item} label={labels[index]} /> : legacyAvailable ? <>
                <p className="mt-2 text-sm">DNI anterior · compatibilidad</p>
                <object data={legacyUrl} aria-label={`Vista previa de ${labels[index]} anterior`} className="mt-3 h-56 w-full">
                  <p>Vista previa no disponible. Utiliza Abrir.</p>
                </object>
                <a href={legacyUrl} target="_blank" rel="noopener noreferrer" className="app-button-secondary mt-3 inline-flex min-h-11 items-center px-3" aria-label={`Abrir ${labels[index]} anterior`}>Abrir</a>
              </> : !loading && !error && <p className="mt-2 app-muted">Sin documento incorporado</p>}
              {side && canUpload && <button type="button" disabled={uploading || needsRefresh}
                className="app-button-secondary mt-4 min-h-11 px-4" onClick={() => {
                  if (uploadLock.current || uncertain.current) return;
                  chooseType(type);
                  fileInput.current?.focus();
                }}>{(item || legacyAvailable) && !error && !loading ? "Incorporar nueva versión" : side === "front" ? "Incorporar frontal" : "Incorporar reverso"}</button>}
            </article>;
          })}
        </div>
      </>}
      {canUpload && <form className="mt-6 min-w-0 space-y-3" aria-busy={uploading} noValidate
        onSubmit={event => { event.preventDefault(); void upload(); }}>
        <h3 className="font-bold">Incorporar documento</h3>
        <p className="text-sm font-semibold">{documentType === "ID_FRONT" ? "DNI frontal" : documentType === "ID_BACK" ? "DNI reverso" : "Elige Incorporar frontal o Incorporar reverso."}</p>
        <label className="block text-sm font-semibold" htmlFor={`document-file-${memberId}`}>Archivo</label>
        <input ref={fileInput} id={`document-file-${memberId}`} type="file" required
          accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading || needsRefresh}
          aria-describedby={`document-help-${memberId}`} className="block w-full min-w-0 overflow-hidden text-sm"
          onChange={event => { if (!uploadLock.current && !uncertain.current) selectedFile.current = event.target.files?.[0] ?? null; }} />
        <p id={`document-help-${memberId}`} className="text-sm app-muted">Formatos admitidos: JPEG, PNG, WEBP y PDF. Tamaño máximo: 5 MiB.</p>
        {!loading && !error && items?.some(item => item.type === documentType) && <p className="text-sm">Se conservarán los documentos anteriores.</p>}
        <button type="submit" disabled={uploading || needsRefresh} className="app-button-primary min-h-11 w-full px-4 sm:w-auto">Incorporar documento</button>
        {uploading && <p role="status">Incorporando documento…</p>}
      </form>}
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
            const label = item.type === "ID_FRONT" ? labels[0] : labels[1];
            const current = item.isCurrent;
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
