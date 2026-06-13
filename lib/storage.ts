import { getSupabaseAdmin } from "@/lib/supabase-admin";

const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";
const STORAGE_SIGNED_PREFIX = "/storage/v1/object/sign/";
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "club-uploads";
export const STORAGE_MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const STORAGE_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const STORAGE_UPLOAD_DISABLED_MESSAGE =
  "Subida de archivos desactivada temporalmente.";

export type StorageObjectRef = {
  bucket: string;
  path: string;
};

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export function isStorageUrlsDisabled() {
  return process.env.DISABLE_STORAGE_URLS === "true";
}

function warnStorageUrlFailure(message: string, error?: unknown) {
  console.warn(
    `[storage] ${message}`,
    error instanceof Error ? error.message : error ?? ""
  );
}

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

export function buildMemberPhotoPath(
  memberId: number,
  timestamp: number,
  extension: string
) {
  return `members/${memberId}/profile-${timestamp}.${extension}`;
}

export function buildStoredStorageRef(bucket: string, path: string) {
  return `${bucket}/${path}`;
}

export function buildStoragePublicUrl(path: string, bucket = STORAGE_BUCKET) {
  const baseUrl = process.env.SUPABASE_URL;

  if (!baseUrl) {
    throw new Error("SUPABASE_URL no configurada");
  }

  return `${baseUrl.replace(/\/+$/, "")}${STORAGE_PUBLIC_PREFIX}${bucket}/${path}`;
}

export async function uploadImageToStorage(file: File, path: string) {
  if (isStorageUrlsDisabled()) {
    throw new Error(STORAGE_UPLOAD_DISABLED_MESSAGE);
  }

  const supabaseAdmin = getSupabaseAdmin();

  const upload = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });

  if (upload.error) {
    throw new Error("No se pudo subir el archivo a storage");
  }

  return {
    bucket: STORAGE_BUCKET,
    path,
    storageRef: buildStoredStorageRef(STORAGE_BUCKET, path),
    publicUrl: buildStoragePublicUrl(path),
  };
}

function parseStoragePath(
  value: string,
  defaultBucket: string | undefined
): StorageObjectRef | null {
  const [firstPart, ...pathParts] = value.split("/").filter(Boolean);

  if (!firstPart) {
    return null;
  }

  if (pathParts.length === 0) {
    return defaultBucket ? { bucket: defaultBucket, path: firstPart } : null;
  }

  if (defaultBucket && ["members", "products", "contracts"].includes(firstPart)) {
    return {
      bucket: defaultBucket,
      path: [firstPart, ...pathParts].join("/"),
    };
  }

  return {
    bucket: firstPart,
    path: pathParts.join("/"),
  };
}

export function parseStorageUrl(
  value: string | null | undefined,
  options?: { defaultBucket?: string; allowedBuckets?: readonly string[] }
): StorageObjectRef | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  const defaultBucket = options?.defaultBucket ?? STORAGE_BUCKET;

  if (!trimmedValue) {
    return null;
  }

  let ref: StorageObjectRef | null = null;
  const baseUrl = process.env.SUPABASE_URL;

  if (!trimmedValue.includes("://")) {
    if (trimmedValue.startsWith("/")) {
      const prefix = [STORAGE_PUBLIC_PREFIX, STORAGE_SIGNED_PREFIX].find((item) =>
        trimmedValue.startsWith(item)
      );

      if (!prefix) {
        return null;
      }

      ref = parseStoragePath(trimmedValue.slice(prefix.length), undefined);
    } else {
      ref = parseStoragePath(trimmedValue, defaultBucket);
    }
  } else {
    if (!baseUrl) {
      return null;
    }

    try {
      const url = new URL(trimmedValue);
      const parsedBase = new URL(baseUrl);

      if (url.origin !== parsedBase.origin) {
        return null;
      }

      const prefix = [STORAGE_PUBLIC_PREFIX, STORAGE_SIGNED_PREFIX].find((item) =>
        url.pathname.startsWith(item)
      );

      if (!prefix) {
        return null;
      }

      ref = parseStoragePath(url.pathname.slice(prefix.length), undefined);
    } catch {
      return null;
    }
  }

  if (!ref?.bucket || !ref.path) {
    return null;
  }

  if (options?.allowedBuckets && !options.allowedBuckets.includes(ref.bucket)) {
    return null;
  }

  return ref;
}

export async function createStorageSignedUrl(
  ref: StorageObjectRef,
  expiresIn = STORAGE_SIGNED_URL_TTL_SECONDS
) {
  if (isStorageUrlsDisabled()) {
    return null;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const signed = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expiresIn);

    if (signed.error || !signed.data?.signedUrl) {
      warnStorageUrlFailure("No se pudo generar URL temporal de storage", signed.error);
      return null;
    }

    return signed.data.signedUrl;
  } catch (error) {
    warnStorageUrlFailure("Fallo generando URL temporal de storage", error);
    return null;
  }
}

export async function resolveStorageUrlForResponse(
  value: string | null | undefined,
  options?: { defaultBucket?: string; allowedBuckets?: readonly string[] }
) {
  const ref = parseStorageUrl(value, options);

  if (!ref) {
    return null;
  }

  return createStorageSignedUrl(ref);
}
