"use client";

import { useRef, useState } from "react";

type MemberPhotoCardProps = {
  memberId: number | string;
  initialPhotoUrl: string | null;
  canUpload: boolean;
  onUploaded?: () => Promise<void> | void;
};

const ACCEPTED_PHOTO_TYPES = ".jpg,.jpeg,.png,.webp";

export function MemberPhotoCard({
  memberId,
  initialPhotoUrl,
  canUpload,
  onUploaded,
}: MemberPhotoCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function uploadPhoto(file: File) {
    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    setError("");

    try {
      const res = await fetch(`/api/members/${memberId}/photo`, {
        method: "POST",
        body: formData,
      });
      const payload = await res.json();

      if (!res.ok) {
        setError(payload.error || "No se pudo subir la foto.");
        return;
      }

      setPhotoUrl(payload.photoUrl ?? null);
      await onUploaded?.();
    } catch {
      setError("No se pudo subir la foto.");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-black/8 bg-white/82">
      <div className="border-b border-black/7 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-[2px] w-5 rounded-full bg-[#b4a78d]" />

              <span className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-[#6d6860]">
                Identidad visual
              </span>
            </div>

            <h3 className="font-black text-[#201f1d]">
              Foto del socio
            </h3>

            <p className="mt-1 text-sm leading-6 app-muted">
              Imagen de referencia para identificar al socio durante la operativa
              del club.
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              photoUrl
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {photoUrl ? "FOTO ADJUNTADA" : "FOTO PENDIENTE"}
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <div
            className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-[1.5rem] border ${
              photoUrl
                ? "border-black/8 bg-[#f7f4ee]"
                : "border-dashed border-amber-300 bg-amber-50/45"
            }`}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Foto del socio"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="p-5 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-xl font-black text-amber-800">
                  ?
                </div>

                <div className="mt-3 text-sm font-black text-[#201f1d]">
                  Sin foto
                </div>

                <p className="mt-1 text-xs leading-5 app-muted">
                  Identificación visual pendiente.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] app-muted">
              Estado
            </div>

            <div
              className={`mt-1 text-lg font-black ${
                photoUrl ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              {photoUrl ? "Foto disponible" : "Pendiente de adjuntar"}
            </div>

            <p className="mt-3 max-w-xl text-sm leading-6 app-muted">
              Utiliza una fotografía reciente y reconocible del socio. Se admiten
              archivos JPG, PNG o WEBP de hasta 5 MB.
            </p>
          </div>

          {canUpload ? (
            <div className="mt-5">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) {
                    void uploadPhoto(file);
                  }
                }}
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    photoUrl
                      ? "app-button-secondary"
                      : "app-button-primary"
                  }`}
                >
                  {uploading
                    ? "Subiendo..."
                    : photoUrl
                      ? "Reemplazar foto"
                      : "Subir foto"}
                </button>

                <a
                  href={photoUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!photoUrl}
                  className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-center text-sm font-bold transition ${
                    photoUrl
                      ? "bg-[#0b0b0c] text-white hover:bg-[#171719]"
                      : "pointer-events-none border border-black/8 bg-black/5 text-black/35"
                  }`}
                >
                  Abrir foto
                </a>
              </div>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
