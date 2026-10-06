import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Shared by canonical delivery and the legacy DNI response formatter.
const formats = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
} as const;

export function memberDocumentReadExtension(mimeType: string) {
  return Object.hasOwn(formats, mimeType) ? formats[mimeType as keyof typeof formats] : null;
}

type PersistedMemberDocument = {
  storageBucket: string;
  storageKey: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
};

export class MemberDocumentReadError extends Error {
  constructor() { super("MEMBER_DOCUMENT_UNAVAILABLE"); }
}

// Resolution, access policy and HTTP contracts belong to the caller.
export async function readVerifiedMemberDocument(document: PersistedMemberDocument) {
  try {
    const download = await getSupabaseAdmin().storage.from(document.storageBucket).download(document.storageKey);
    if (download.error || !download.data) throw new MemberDocumentReadError();
    const bytes = await download.data.arrayBuffer();
    const mimeType = document.mimeType;
    const extension = memberDocumentReadExtension(mimeType);
    if (!extension || bytes.byteLength === 0 || bytes.byteLength !== document.byteLength ||
        createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== document.sha256) {
      throw new MemberDocumentReadError();
    }
    return { bytes, mimeType, byteLength: bytes.byteLength, extension };
  } catch {
    throw new MemberDocumentReadError();
  }
}
