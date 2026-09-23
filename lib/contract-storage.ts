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

const SIGNING_TEMPLATE_ERRORS = {
  SIGNING_TEMPLATE_UNRESOLVED: { status: 409, message: "La sesión no tiene una plantilla identificada. Solicita un nuevo enlace al personal." },
  SIGNING_TEMPLATE_CHANGED: { status: 409, message: "La plantilla no coincide con la revisada. Revisa el documento y vuelve a firmar." },
  SIGNING_TEMPLATE_UNAVAILABLE: { status: 503, message: "El documento contractual no está disponible. Reintenta su carga antes de firmar." },
} as const;

export class SigningTemplateError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof SIGNING_TEMPLATE_ERRORS) {
    super(SIGNING_TEMPLATE_ERRORS[code].message);
    this.status = SIGNING_TEMPLATE_ERRORS[code].status;
  }
}

// Storage IO only: callers must perform this before opening a DB transaction.
// A cached URL is never evidence that the object still exists.
export async function requireSigningTemplateDocument(fileUrl: string) {
  try {
    const { bytes } = await downloadAllowedStorageObject(fileUrl, { cache: "no-store" });
    if (bytes.length === 0) throw new Error("Empty document");
    const url = await createSignedUrlForAllowedStorageRef(fileUrl, {
      cache: false,
      context: "signing:templateAvailability",
    });
    if (!url) throw new Error("Missing document URL");
    return url;
  } catch {
    throw new SigningTemplateError("SIGNING_TEMPLATE_UNAVAILABLE");
  }
}

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
  fileUrl: string | null | undefined,
  options?: { context?: string; expiresIn?: number; cache?: boolean }
) {
  if (!fileUrl) {
    return null;
  }

  const ref = parseAllowedStorageRef(fileUrl);

  if (!ref) {
    return null;
  }

  return createStorageSignedUrl(ref, options);
}

export function serializeAllowedStorageRef(ref: Pick<StorageObjectRef, "bucket" | "path">) {
  return buildStoredStorageRef(ref.bucket, ref.path);
}

export async function downloadAllowedStorageObject(fileUrl: string, parameters?: { cache: "no-store" }) {
  if (isStorageUrlsDisabled()) {
    throw new Error("PDFs de contratos desactivados temporalmente.");
  }

  const ref = parseAllowedStorageRef(fileUrl);

  if (!ref) {
    throw new Error("La plantilla debe estar en Supabase Storage del proyecto");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const download = await supabaseAdmin.storage.from(ref.bucket).download(ref.path, undefined, parameters);

  if (download.error || !download.data) {
    throw new Error("No se pudo cargar la plantilla PDF");
  }

  return {
    ref,
    bytes: Buffer.from(await download.data.arrayBuffer()),
  };
}
