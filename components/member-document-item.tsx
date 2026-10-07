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
  return <>
    <p className="mt-2 min-w-0 break-words [overflow-wrap:anywhere]">{item.originalName}</p>
    <p className="mt-1 text-sm app-muted">{formats[item.mimeType] ?? "Archivo"} · {size}</p>
    <p className="mt-1 text-sm app-muted">Incorporado: <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("es-ES")}</time></p>
    {!compact && (image ? <div className="mt-3" aria-busy={preview === "loading"}>
      {preview === "loading" && <p role="status">Cargando vista previa…</p>}
      {preview === "error" ? <p role="alert">No se pudo cargar la vista previa.</p> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={inline} alt={`Vista previa de ${label}: ${item.originalName}`} className="max-h-56 w-full object-contain" onLoad={() => setPreview("ready")} onError={() => setPreview("error")} />}
    </div> : <p className="mt-3 rounded-xl bg-black/5 p-4 font-semibold">{formats[item.mimeType] ?? "Archivo"}</p>)}
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <a className="app-button-secondary inline-flex min-h-11 items-center justify-center px-3" href={inline} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label} en una nueva pestaña`}>Abrir</a>
      <a className="app-button-secondary inline-flex min-h-11 items-center justify-center px-3" href={attachment} aria-label={`Descargar ${label}`}>Descargar</a>
    </div>
  </>;
}
