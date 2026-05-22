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
    <section className="rounded-3xl border border-black/8 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-3xl border border-black/8 bg-white md:w-44">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Foto del socio"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="text-sm font-medium text-gray-500">Sin foto</div>
          )}
        </div>

        <div className="flex-1">
          <div className="text-sm text-gray-500">Foto de perfil</div>
          <div className="mt-1 font-medium">
            {photoUrl ? "Foto adjuntada" : "Pendiente"}
          </div>
          <p className="mt-2 text-sm text-gray-500">
            JPG, PNG o WEBP. Maximo 5 MB.
          </p>

          {canUpload && (
            <div className="mt-4 flex flex-wrap gap-2">
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

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="rounded-full bg-gray-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "Subiendo..." : "Subir foto del socio"}
              </button>

              <a
                href={photoUrl || "#"}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!photoUrl}
                className={`rounded-full px-4 py-2 text-center ${
                  photoUrl
                    ? "app-button-primary text-white"
                    : "pointer-events-none bg-gray-200 text-gray-500"
                }`}
              >
                Abrir foto
              </a>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
