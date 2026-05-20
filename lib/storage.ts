import { supabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "club-uploads";
export const STORAGE_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export function validateImageFile(file: File) {
  if (!(file.type in ALLOWED_IMAGE_TYPES)) {
    return "Solo se permiten imagenes JPG, PNG o WEBP.";
  }

  if (file.size > STORAGE_MAX_IMAGE_SIZE_BYTES) {
    return "La imagen supera el limite de 5 MB.";
  }

  return null;
}

export function getImageExtension(type: string) {
  if (!(type in ALLOWED_IMAGE_TYPES)) {
    return null;
  }

  return ALLOWED_IMAGE_TYPES[type as AllowedImageType];
}

export function buildProductImagePath(productId: number, timestamp: number, extension: string) {
  return `products/${productId}-${timestamp}.${extension}`;
}

export function buildMemberDniPath(
  memberId: number,
  side: "front" | "back",
  timestamp: number,
  extension: string
) {
  return `members/${memberId}/dni-${side}-${timestamp}.${extension}`;
}

export function buildStoragePublicUrl(path: string) {
  const baseUrl = process.env.SUPABASE_URL;

  if (!baseUrl) {
    throw new Error("SUPABASE_URL no configurada");
  }

  return `${baseUrl.replace(/\/+$/, "")}${STORAGE_PUBLIC_PREFIX}${STORAGE_BUCKET}/${path}`;
}

export async function uploadImageToStorage(file: File, path: string) {
  const upload = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });

  if (upload.error) {
    throw new Error(`Error subiendo archivo a storage: ${upload.error.message}`);
  }

  return {
    bucket: STORAGE_BUCKET,
    path,
    publicUrl: buildStoragePublicUrl(path),
  };
}

export function parseStorageUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const baseUrl = process.env.SUPABASE_URL;

  if (!baseUrl) {
    return null;
  }

  try {
    const url = new URL(value);
    const parsedBase = new URL(baseUrl);

    if (url.origin !== parsedBase.origin) {
      return null;
    }

    if (!url.pathname.startsWith(`${STORAGE_PUBLIC_PREFIX}${STORAGE_BUCKET}/`)) {
      return null;
    }

    return {
      bucket: STORAGE_BUCKET,
      path: url.pathname.slice(
        `${STORAGE_PUBLIC_PREFIX}${STORAGE_BUCKET}/`.length
      ),
    };
  } catch {
    return null;
  }
}
