const MIME_EXTENSION_MAP = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;

export const MEMBER_DOCUMENT_BUCKET = "member-documents";
export const MEMBER_DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export type MemberDocumentSide = "front" | "back";

export function isAllowedMemberDocumentType(
  value: string
): value is keyof typeof MIME_EXTENSION_MAP {
  return value in MIME_EXTENSION_MAP;
}

export function getMemberDocumentExtension(
  contentType: keyof typeof MIME_EXTENSION_MAP
) {
  return MIME_EXTENSION_MAP[contentType];
}

export function buildMemberDocumentPath(
  memberId: number,
  side: MemberDocumentSide,
  extension: string
) {
  return `members/${memberId}/dni-${side}.${extension}`;
}

export function buildStoredMemberDocumentRef(path: string) {
  return `${MEMBER_DOCUMENT_BUCKET}/${path}`;
}

export function parseStoredMemberDocumentRef(value: string | null | undefined) {
  if (!value) return null;

  if (value.startsWith(`${MEMBER_DOCUMENT_BUCKET}/`)) {
    return {
      bucket: MEMBER_DOCUMENT_BUCKET,
      path: value.slice(MEMBER_DOCUMENT_BUCKET.length + 1),
    };
  }

  if (value.startsWith("members/")) {
    return {
      bucket: MEMBER_DOCUMENT_BUCKET,
      path: value,
    };
  }

  return null;
}
