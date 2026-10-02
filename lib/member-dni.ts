import "server-only";

import { prisma } from "@/lib/prisma";
import { parseStorageUrl, STORAGE_BUCKET } from "@/lib/storage";
import { MEMBER_DOCUMENT_BUCKET, type MemberDocumentSide } from "@/lib/member-documents";

export function memberDniContentUrl(memberId: number, side: MemberDocumentSide) {
  return `/api/members/${memberId}/documents?side=${side}`;
}

// Only formats emitted by the historical DNI writers. Bare fixed paths were
// interpreted by /documents in member-documents; timestamp paths by /dni in
// STORAGE_BUCKET. Absolute public/signed URLs must belong to our Supabase origin.
export function parseLegacyDniRef(value: string | null, memberId: number, side: MemberDocumentSide) {
  const fixed = `members/${memberId}/dni-${side}.`;
  const defaultBucket = value?.trim().startsWith(fixed) ? MEMBER_DOCUMENT_BUCKET : STORAGE_BUCKET;
  const ref = parseStorageUrl(value, { defaultBucket,
    allowedBuckets: [...new Set(["club-uploads", STORAGE_BUCKET, MEMBER_DOCUMENT_BUCKET])] });
  if (!ref) return null;
  const fixedPath = new RegExp(`^members/${memberId}/dni-${side}\\.(jpg|png|pdf)$`);
  const timestampPath = new RegExp(`^members/${memberId}/dni-${side}-[0-9]+\\.(jpg|png|webp)$`);
  if (ref.bucket === MEMBER_DOCUMENT_BUCKET && fixedPath.test(ref.path)) return ref;
  if (["club-uploads", STORAGE_BUCKET].includes(ref.bucket) && timestampPath.test(ref.path)) return ref;
  return null;
}

export async function resolveMemberDni(memberId: number, side: MemberDocumentSide, legacy: string | null) {
  const document = await prisma.memberDocument.findFirst({
    where: { memberId, type: side === "front" ? "ID_FRONT" : "ID_BACK" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { storageBucket: true, storageKey: true, mimeType: true, byteLength: true, sha256: true },
  });
  if (document) return { source: "new" as const, ...document };
  const ref = parseLegacyDniRef(legacy, memberId, side);
  return ref ? { source: "legacy" as const, storageBucket: ref.bucket, storageKey: ref.path } : null;
}

export async function memberDniUrls(member: { id: number; dniFrontUrl: string | null; dniBackUrl: string | null }) {
  const [front, back] = await Promise.all([
    resolveMemberDni(member.id, "front", member.dniFrontUrl),
    resolveMemberDni(member.id, "back", member.dniBackUrl),
  ]);
  return {
    dniFrontUrl: front ? memberDniContentUrl(member.id, "front") : null,
    dniBackUrl: back ? memberDniContentUrl(member.id, "back") : null,
  };
}
