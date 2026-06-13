import {
  buildStoragePublicUrl,
  buildStoredStorageRef,
  createStorageSignedUrl,
  isStorageUrlsDisabled,
  parseStorageUrl,
  type StorageObjectRef,
} from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_CONTRACT_BUCKETS = ["contract-templates", "signed-contracts"] as const;

type AllowedStorageObjectRef = {
  bucket: string;
  path: string;
  publicUrl: string;
  storageRef: string;
};

export function parseAllowedStorageRef(fileUrl: string): AllowedStorageObjectRef | null {
  const ref = parseStorageUrl(fileUrl, {
    allowedBuckets: ALLOWED_CONTRACT_BUCKETS,
  });

  if (!ref) {
    return null;
  }

  return {
    ...ref,
    publicUrl: buildStoragePublicUrl(ref.path, ref.bucket),
    storageRef: buildStoredStorageRef(ref.bucket, ref.path),
  };
}

export async function createSignedUrlForAllowedStorageRef(
  fileUrl: string | null | undefined
) {
  if (!fileUrl || isStorageUrlsDisabled()) {
    return null;
  }

  const ref = parseAllowedStorageRef(fileUrl);

  if (!ref) {
    return null;
  }

  return createStorageSignedUrl(ref);
}

export function serializeAllowedStorageRef(ref: Pick<StorageObjectRef, "bucket" | "path">) {
  return buildStoredStorageRef(ref.bucket, ref.path);
}

export async function downloadAllowedStorageObject(fileUrl: string) {
  if (isStorageUrlsDisabled()) {
    throw new Error("PDFs de contratos desactivados temporalmente.");
  }

  const ref = parseAllowedStorageRef(fileUrl);

  if (!ref) {
    throw new Error("La plantilla debe estar en Supabase Storage del proyecto");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const download = await supabaseAdmin.storage.from(ref.bucket).download(ref.path);

  if (download.error || !download.data) {
    throw new Error("No se pudo cargar la plantilla PDF");
  }

  return {
    ref,
    bytes: Buffer.from(await download.data.arrayBuffer()),
  };
}
