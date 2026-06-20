import { getSupabaseAdmin } from "@/lib/supabase-admin";
import sharp from "sharp";

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
export const STORAGE_CACHEABLE_IMAGE_TTL_SECONDS = 24 * 60 * 60;
export const STORAGE_CACHEABLE_IMAGE_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";
export const PRODUCT_THUMBNAIL_MAX_WIDTH = 400;
export const PRODUCT_THUMBNAIL_TARGET_BYTES = 150 * 1024;
export const STORAGE_UPLOAD_DISABLED_MESSAGE =
  "Subida de archivos desactivada temporalmente.";
const STORAGE_SIGNED_URL_CACHE_SAFETY_MS = 60_000;

export type StorageObjectRef = {
  bucket: string;
  path: string;
};

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;
type SignedUrlCacheEntry = {
  signedUrl: string;
  expiresAt: number;
};

type StorageSignedUrlOptions = {
  expiresIn?: number;
  context?: string;
  cache?: boolean;
};

type StorageResolveUrlOptions = {
  defaultBucket?: string;
  allowedBuckets?: readonly string[];
  context?: string;
  expiresIn?: number;
  cache?: boolean;
};

type StorageUploadBufferOptions = {
  contentType: string;
  bucket?: string;
  cacheControl?: string;
};

export type ProductThumbnailResult = {
  buffer: Buffer;
  contentType: "image/webp" | "image/jpeg" | "image/png";
  extension: "webp" | "jpg" | "png";
};

const globalStorageState = globalThis as typeof globalThis & {
  __clubStorageSignedUrlCache?: Map<string, SignedUrlCacheEntry>;
  __clubStorageResolutionCounters?: Map<string, number>;
};

const signedUrlCache =
  globalStorageState.__clubStorageSignedUrlCache ??
  new Map<string, SignedUrlCacheEntry>();
const storageResolutionCounters =
  globalStorageState.__clubStorageResolutionCounters ?? new Map<string, number>();

globalStorageState.__clubStorageSignedUrlCache = signedUrlCache;
globalStorageState.__clubStorageResolutionCounters = storageResolutionCounters;

export function isStorageUrlsDisabled() {
  return process.env.DISABLE_STORAGE_URLS === "true";
}

function warnStorageUrlFailure(message: string, error?: unknown) {
  console.warn(
    `[storage] ${message}`,
    error instanceof Error ? error.message : error ?? ""
  );
}

function getStorageCounterKey(
  context: string,
  ref: StorageObjectRef,
  outcome: string
) {
  return `${context}:${ref.bucket}:${outcome}`;
}

function recordStorageUrlResolution(
  ref: StorageObjectRef,
  outcome: "cache-hit" | "signed-url" | "disabled" | "error",
  context = "unknown"
) {
  const key = getStorageCounterKey(context, ref, outcome);
  const count = (storageResolutionCounters.get(key) ?? 0) + 1;
  storageResolutionCounters.set(key, count);

  console.info(
    `[storage-egress] context=${context} bucket=${ref.bucket} outcome=${outcome} count=${count}`
  );
}

function normalizeSignedUrlOptions(
  options?: number | StorageSignedUrlOptions
): Required<Pick<StorageSignedUrlOptions, "expiresIn" | "cache">> &
  Pick<StorageSignedUrlOptions, "context"> {
  if (typeof options === "number") {
    return {
      expiresIn: options,
      cache: true,
      context: undefined,
    };
  }

  return {
    expiresIn: options?.expiresIn ?? STORAGE_SIGNED_URL_TTL_SECONDS,
    cache: options?.cache !== false,
    context: options?.context,
  };
}

function getSignedUrlCacheKey(ref: StorageObjectRef, expiresIn: number) {
  return `${ref.bucket}/${ref.path}:${expiresIn}`;
}

export function getStorageUrlResolutionCounters() {
  return Array.from(storageResolutionCounters.entries()).map(([key, count]) => ({
    key,
    count,
  }));
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

export function buildProductImagePath(
  productId: number,
  timestamp: number,
  extension: string
) {
  return `products/${productId}/image-${timestamp}.${extension}`;
}

export function buildProductThumbnailPath(
  productId: number,
  timestamp: number,
  extension = "webp"
) {
  return `products/${productId}/thumb-${timestamp}.${extension}`;
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

export async function uploadBufferToStorage(
  buffer: Buffer,
  path: string,
  options: StorageUploadBufferOptions
) {
  if (isStorageUrlsDisabled()) {
    throw new Error(STORAGE_UPLOAD_DISABLED_MESSAGE);
  }

  const bucket = options.bucket ?? STORAGE_BUCKET;
  const supabaseAdmin = getSupabaseAdmin();

  const upload = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: options.contentType,
      cacheControl: options.cacheControl ?? String(STORAGE_CACHEABLE_IMAGE_TTL_SECONDS),
      upsert: true,
    });

  if (upload.error) {
    throw new Error("No se pudo subir el archivo a storage");
  }

  return {
    bucket,
    path,
    storageRef: buildStoredStorageRef(bucket, path),
    publicUrl: buildStoragePublicUrl(path, bucket),
  };
}

export async function uploadImageToStorage(file: File, path: string) {
  return uploadBufferToStorage(Buffer.from(await file.arrayBuffer()), path, {
    contentType: file.type,
  });
}

function getProductThumbnailPipeline(input: Buffer) {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: PRODUCT_THUMBNAIL_MAX_WIDTH,
      withoutEnlargement: true,
    });
}

async function createWebpThumbnail(input: Buffer, quality: number) {
  return getProductThumbnailPipeline(input)
    .webp({
      quality,
      effort: 4,
    })
    .toBuffer();
}

async function createJpegThumbnail(input: Buffer, quality: number) {
  return getProductThumbnailPipeline(input)
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer();
}

async function createPngThumbnail(input: Buffer) {
  return getProductThumbnailPipeline(input)
    .png({
      compressionLevel: 9,
      palette: true,
    })
    .toBuffer();
}

function pickSmallestBuffer(buffers: Buffer[]) {
  return buffers.reduce((smallest, current) =>
    current.length < smallest.length ? current : smallest
  );
}

export async function createProductThumbnail(
  input: Buffer,
  originalContentType?: string
): Promise<ProductThumbnailResult> {
  const webpBuffers: Buffer[] = [];

  try {
    for (const quality of [78, 70, 62, 54]) {
      const buffer = await createWebpThumbnail(input, quality);
      webpBuffers.push(buffer);

      if (buffer.length <= PRODUCT_THUMBNAIL_TARGET_BYTES) {
        return {
          buffer,
          contentType: "image/webp",
          extension: "webp",
        };
      }
    }

    return {
      buffer: pickSmallestBuffer(webpBuffers),
      contentType: "image/webp",
      extension: "webp",
    };
  } catch (error) {
    warnStorageUrlFailure("No se pudo generar miniatura webp; usando fallback", error);
  }

  if (originalContentType === "image/png") {
    return {
      buffer: await createPngThumbnail(input),
      contentType: "image/png",
      extension: "png",
    };
  }

  const jpegBuffers: Buffer[] = [];
  for (const quality of [76, 68, 60]) {
    const buffer = await createJpegThumbnail(input, quality);
    jpegBuffers.push(buffer);

    if (buffer.length <= PRODUCT_THUMBNAIL_TARGET_BYTES) {
      return {
        buffer,
        contentType: "image/jpeg",
        extension: "jpg",
      };
    }
  }

  return {
    buffer: pickSmallestBuffer(jpegBuffers),
    contentType: "image/jpeg",
    extension: "jpg",
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
  options?: number | StorageSignedUrlOptions
) {
  const { expiresIn, cache, context } = normalizeSignedUrlOptions(options);

  if (isStorageUrlsDisabled()) {
    recordStorageUrlResolution(ref, "disabled", context);
    return null;
  }

  const now = Date.now();
  const cacheKey = getSignedUrlCacheKey(ref, expiresIn);

  if (cache) {
    const cached = signedUrlCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      recordStorageUrlResolution(ref, "cache-hit", context);
      return cached.signedUrl;
    }

    signedUrlCache.delete(cacheKey);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const signed = await supabaseAdmin.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expiresIn);

    if (signed.error || !signed.data?.signedUrl) {
      recordStorageUrlResolution(ref, "error", context);
      warnStorageUrlFailure("No se pudo generar URL temporal de storage", signed.error);
      return null;
    }

    if (cache) {
      const cacheTtlMs = expiresIn * 1000 - STORAGE_SIGNED_URL_CACHE_SAFETY_MS;

      if (cacheTtlMs > 0) {
        signedUrlCache.set(cacheKey, {
          signedUrl: signed.data.signedUrl,
          expiresAt: now + cacheTtlMs,
        });
      }
    }

    recordStorageUrlResolution(ref, "signed-url", context);
    return signed.data.signedUrl;
  } catch (error) {
    recordStorageUrlResolution(ref, "error", context);
    warnStorageUrlFailure("Fallo generando URL temporal de storage", error);
    return null;
  }
}

export async function resolveStorageUrlForResponse(
  value: string | null | undefined,
  options?: StorageResolveUrlOptions
) {
  const ref = parseStorageUrl(value, options);

  if (!ref) {
    return null;
  }

  return createStorageSignedUrl(ref, {
    expiresIn: options?.expiresIn,
    context: options?.context,
    cache: options?.cache,
  });
}
