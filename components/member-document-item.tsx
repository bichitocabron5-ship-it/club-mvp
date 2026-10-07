"use client";

import { useState } from "react";
import type { MemberDocumentListItem } from "@/lib/types";

const formats: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "application/pdf": "PDF" };

export function MemberDocumentItem({ memberId, item, label, compact = false }: {
  memberId: number | string; item: MemberDocumentListItem; label: string; compact?: boolean;
}) {
  const [preview, setPreview] = useState<"loading" | "ready" | "error">("loading");
  const inline = `/api/members/${memberId}/member-documents/${item.id}/content?disposition=inline`;
  const attachment = `/api/members/${memberId}/member-documents/${item.id}/content?disposition=attachment`;
  const image = ["image/jpeg", "image/png", "image/webp"].includes(item.mimeType);
  const size = item.byteLength < 1024 ? `${item.byteLength} B` : item.byteLength < 1024 * 1024
    ? `${(item.byteLength / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} KiB`
    : `${(item.byteLength / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MiB`;
  return <div className={compact ? undefined : "flex min-w-0 flex-1 flex-col"}>
    <p className="mt-2 min-w-0 break-words [overflow-wrap:anywhere]">{item.originalName}</p>
    <p className="mt-1 text-sm app-muted">{formats[item.mimeType] ?? "Archivo"} · {size}</p>
    <p className="mt-1 text-sm app-muted">Incorporado: <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("es-ES")}</time></p>
    {!compact && (image ? <div className="relative order-first mb-3 flex min-h-64 items-center justify-center rounded-xl border border-black/10 bg-black/5 p-3" aria-busy={preview === "loading"}>
      {preview === "loading" && <p role="status" className="absolute inset-x-3 top-3 text-center text-sm app-muted">Cargando vista previa…</p>}
      {preview === "error" ? <p role="alert" className="text-center text-sm">No se pudo cargar la vista previa.</p> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={inline} alt={`Vista previa de ${label}: ${item.originalName}`} className="h-64 w-full min-w-0 object-contain sm:h-72" onLoad={() => setPreview("ready")} onError={() => setPreview("error")} />}
    </div> : <div className="order-first mb-3 flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-black/10 bg-black/5 p-4 text-center sm:min-h-72">
      <span aria-hidden="true" className="rounded-xl border border-black/10 bg-white/60 px-4 py-5 text-xl font-black">{formats[item.mimeType] ?? "Archivo"}</span>
      <p className="font-semibold">{item.mimeType === "application/pdf" ? "Documento PDF" : "Documento incorporado"}</p>
    </div>)}
    <div className={compact ? "mt-4 grid gap-2 sm:grid-cols-2" : "mt-auto grid gap-2 pt-4 sm:grid-cols-2"}>
      <a className={`app-button-secondary inline-flex ${compact ? "min-h-11" : "min-h-12"} items-center justify-center px-3`} href={inline} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label} en una nueva pestaña`}>Abrir</a>
      <a className={`app-button-secondary inline-flex ${compact ? "min-h-11" : "min-h-12"} items-center justify-center px-3`} href={attachment} aria-label={`Descargar ${label}`}>Descargar</a>
    </div>
  </div>;
}
