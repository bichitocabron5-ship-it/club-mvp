"use client";

import { useRef, useState, type RefObject } from "react";

type MemberDocumentsCardProps = {
  memberId: number | string;
  initialFrontUrl: string | null;
  initialBackUrl: string | null;
  onUploaded?: () => Promise<void> | void;
};

type DocumentSide = "front" | "back";

const ACCEPTED_DOCUMENT_TYPES = ".jpg,.jpeg,.png,.webp";

export function MemberDocumentsCard({
  memberId,
  initialFrontUrl,
  initialBackUrl,
  onUploaded,
}: MemberDocumentsCardProps) {
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);

  const [frontUrl, setFrontUrl] = useState(initialFrontUrl);
  const [backUrl, setBackUrl] = useState(initialBackUrl);
  const [uploadingSide, setUploadingSide] = useState<DocumentSide | null>(null);
  const [message, setMessage] = useState("");

  async function uploadDocument(side: DocumentSide, file: File) {
    const formData = new FormData();
    formData.append("side", side);
    formData.append("image", file);
    setUploadingSide(side);
    setMessage("");

    try {
      const res = await fetch(`/api/members/${memberId}/dni`, {
        method: "POST",
        body: formData,
      });

      const payload = await res.json();

      if (!res.ok) {
        setMessage(payload.error || "No se pudo subir el documento.");
        return;
      }

      if (side === "front") {
        setFrontUrl(payload.dniFrontUrl ?? null);
      } else {
        setBackUrl(payload.dniBackUrl ?? null);
      }
      await onUploaded?.();
      setMessage(
        side === "front"
          ? "DNI frontal actualizado."
          : "DNI trasero actualizado."
      );
    } catch {
      setMessage("No se pudo subir el documento.");
    } finally {
      setUploadingSide(null);
      const input = side === "front" ? frontInputRef.current : backInputRef.current;
      if (input) {
        input.value = "";
      }
    }
  }

  function renderDocumentRow(
    side: DocumentSide,
    label: string,
    currentUrl: string | null,
    inputRef: RefObject<HTMLInputElement | null>
  ) {
    const isUploading = uploadingSide === side;
    const actionLabel = currentUrl ? "Reemplazar imagen" : "Subir imagen";
    const shortLabel = side === "front" ? "Anverso" : "Reverso";

    return (
      <article
        className={`overflow-hidden rounded-[1.75rem] border bg-white/88 ${
          currentUrl
            ? "border-black/8"
            : "border-amber-200"
        }`}
      >
        <div className="border-b border-black/7 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-[2px] w-5 rounded-full ${
                    currentUrl ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />

                <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] app-muted">
                  {shortLabel}
                </span>
              </div>

              <h3 className="font-black text-[#201f1d]">
                {label}
              </h3>

              <p className="mt-1 text-sm app-muted">
                {currentUrl
                  ? "Documento adjuntado correctamente."
                  : "Todavía no se ha adjuntado esta cara del documento."}
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-black ${
                currentUrl
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {currentUrl ? "ADJUNTADO" : "PENDIENTE"}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {currentUrl ? (
            <div className="overflow-hidden rounded-[1.5rem] border border-black/8 bg-[#f7f4ee]">
              <div className="flex min-h-[240px] items-center justify-center bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentUrl}
                  alt={label}
                  className="max-h-[320px] w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-[1.5rem] border border-dashed border-amber-300 bg-amber-50/45 p-6 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-lg font-black text-amber-800">
                  !
                </div>

                <div className="mt-3 font-black text-[#201f1d]">
                  Documento pendiente
                </div>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 app-muted">
                  Sube una imagen nítida y completa de esta cara del documento.
                </p>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void uploadDocument(side, file);
              }
            }}
          />

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                currentUrl
                  ? "app-button-secondary"
                  : "app-button-primary"
              }`}
            >
              {isUploading ? "Subiendo..." : actionLabel}
            </button>

            <a
              href={currentUrl || "#"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!currentUrl}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-bold ${
                currentUrl
                  ? "bg-[#0b0b0c] text-white hover:bg-[#171719]"
                  : "pointer-events-none border border-black/8 bg-black/5 text-black/35"
              }`}
            >
              Abrir imagen
            </a>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="app-panel mt-6 overflow-hidden rounded-[2rem]">
      <div className="border-b border-black/7 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-6 rounded-full bg-[#a7282d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#a7282d]">
                Documentación
              </span>
            </div>

            <h2 className="text-xl font-black tracking-[-0.02em] text-[#201f1d]">
              Documento de identidad
            </h2>

            <p className="mt-1 max-w-2xl text-sm leading-6 app-muted">
              Adjunta el anverso y reverso del documento del socio en formato JPG,
              PNG o WEBP.
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-black ${
              frontUrl && backUrl
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {frontUrl && backUrl ? "DOCUMENTACIÓN COMPLETA" : "DOCUMENTACIÓN PENDIENTE"}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div
            className={`rounded-[1.25rem] border p-4 ${
              frontUrl
                ? "border-emerald-100 bg-emerald-50/60"
                : "border-amber-200 bg-amber-50/60"
            }`}
          >
            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
              Anverso
            </div>

            <div
              className={`mt-1 font-black ${
                frontUrl ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              {frontUrl ? "Adjuntado" : "Pendiente"}
            </div>
          </div>

          <div
            className={`rounded-[1.25rem] border p-4 ${
              backUrl
                ? "border-emerald-100 bg-emerald-50/60"
                : "border-amber-200 bg-amber-50/60"
            }`}
          >
            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
              Reverso
            </div>

            <div
              className={`mt-1 font-black ${
                backUrl ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              {backUrl ? "Adjuntado" : "Pendiente"}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {renderDocumentRow("front", "DNI frontal", frontUrl, frontInputRef)}
          {renderDocumentRow("back", "DNI reverso", backUrl, backInputRef)}
        </div>

        {message ? (
          <div
            role="status"
            className="rounded-[1.25rem] border border-[#b4a78d]/25 bg-[#f7f4ee] px-4 py-3 text-sm font-semibold text-[#645b4c]"
          >
            {message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
