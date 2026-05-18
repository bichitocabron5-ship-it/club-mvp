"use client";

import { useRef, useState, type RefObject } from "react";

type MemberDocumentsCardProps = {
  memberId: number | string;
  initialFrontUrl: string | null;
  initialBackUrl: string | null;
};

type DocumentSide = "front" | "back";

const ACCEPTED_DOCUMENT_TYPES = ".jpg,.jpeg,.png,.pdf";

export function MemberDocumentsCard({
  memberId,
  initialFrontUrl,
  initialBackUrl,
}: MemberDocumentsCardProps) {
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);

  const [frontUrl, setFrontUrl] = useState(initialFrontUrl);
  const [backUrl, setBackUrl] = useState(initialBackUrl);
  const [uploadingSide, setUploadingSide] = useState<DocumentSide | null>(null);
  const [message, setMessage] = useState("");

  async function uploadDocument(side: DocumentSide, file: File) {
    const formData = new FormData();
    formData.append(side, file);
    setUploadingSide(side);
    setMessage("");

    try {
      const res = await fetch(`/api/members/${memberId}/documents`, {
        method: "POST",
        body: formData,
      });

      const payload = await res.json();

      if (!res.ok) {
        setMessage(payload.error || "No se pudo subir el documento.");
        return;
      }

      setFrontUrl(payload.member?.dniFrontUrl ?? null);
      setBackUrl(payload.member?.dniBackUrl ?? null);
      setMessage(
        side === "front"
          ? "DNI frontal actualizado."
          : "DNI reverso actualizado."
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
    const actionLabel = currentUrl ? "Reemplazar" : "Subir";

    return (
      <div className="rounded-2xl border border-black/8 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 font-medium">
              {currentUrl ? "Adjuntado" : "Pendiente"}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
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

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="rounded-full bg-gray-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Subiendo..." : actionLabel}
            </button>

            <a
              href={`/api/members/${memberId}/documents?side=${side}`}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!currentUrl}
              className={`rounded-full px-4 py-2 text-center ${
                currentUrl
                  ? "app-button-primary text-white"
                  : "pointer-events-none bg-gray-200 text-gray-500"
              }`}
            >
              Abrir documento
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="app-panel mt-6 rounded-3xl p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Documentos</h2>
        <p className="text-sm text-gray-500">
          Adjunta el DNI del socio en JPG, PNG o PDF.
        </p>
      </div>

      <div className="mt-4 grid gap-3">
        {renderDocumentRow("front", "DNI frontal", frontUrl, frontInputRef)}
        {renderDocumentRow("back", "DNI reverso", backUrl, backInputRef)}
      </div>

      {message && (
        <div className="mt-4 rounded-2xl border border-black/8 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {message}
        </div>
      )}
    </section>
  );
}
