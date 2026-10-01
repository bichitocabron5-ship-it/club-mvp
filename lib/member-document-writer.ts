import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isStorageUrlsDisabled, STORAGE_MAX_IMAGE_SIZE_BYTES } from "@/lib/storage";
import { MEMBER_DOCUMENT_BUCKET } from "@/lib/member-documents";
import { MEMBER_DOCUMENT_TYPE_VALUES, type MemberDocumentType } from "@/lib/types";

export const MEMBER_DOCUMENT_UPLOAD_MAX_BYTES = STORAGE_MAX_IMAGE_SIZE_BYTES;
export const MEMBER_DOCUMENT_REQUEST_MAX_BYTES = MEMBER_DOCUMENT_UPLOAD_MAX_BYTES + 16 * 1024;
const MIME_FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;
const MAX_PIXELS = 16_000_000;

export class MemberDocumentUploadError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

// Only fixed codes and a random operation identifier: never log SDK/DB errors,
// filenames, member/actor identity, hashes, credentials or uploaded bytes.
function signal(code: string, operationId: string) {
  console.error("[member-document-writer]", { code, operationId });
}

function sanitizeName(name: string) {
  return name.normalize("NFKC").split(/[\\/]/).pop()!
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/^\.+/, "")
    .trim().slice(0, 120) || "document";
}

export async function validateMemberDocumentUpload(form: FormData) {
  const keys = [...form.keys()];
  if (keys.length !== 2 || form.getAll("file").length !== 1 || form.getAll("type").length !== 1 ||
      keys.some(key => key !== "file" && key !== "type")) {
    throw new MemberDocumentUploadError("INVALID_FIELDS");
  }
  const file = form.get("file");
  const type = form.get("type");
  if (typeof type !== "string" || !MEMBER_DOCUMENT_TYPE_VALUES.includes(type as MemberDocumentType)) {
    throw new MemberDocumentUploadError("INVALID_DOCUMENT_TYPE");
  }
  if (!(file instanceof File) || file.size === 0) throw new MemberDocumentUploadError("DOCUMENT_EMPTY");
  if (file.size > MEMBER_DOCUMENT_UPLOAD_MAX_BYTES) throw new MemberDocumentUploadError("DOCUMENT_TOO_LARGE", 413);
  if (file.type !== "application/pdf" && !Object.hasOwn(MIME_FORMATS, file.type)) {
    throw new MemberDocumentUploadError("UNSUPPORTED_MIME", 415);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    if (file.type === "application/pdf") {
      if (!/^%PDF-(1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 10).toString("ascii")) ||
          !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))) throw new Error();
      const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
      if (pdf.getPageCount() < 1) throw new Error();
      // Inspect decoded names, including compressed objects and escaped PDF names.
      // Reject actions structurally, including unknown action types. /S also has
      // static uses (tagged structure, borders, transparency and soft masks).
      // Only those explicit non-action contexts are allowed; this is not antivirus.
      const forbidden = new Set(["JS", "JavaScript", "AA", "OpenAction", "Launch", "EmbeddedFiles",
        "EmbeddedFile", "Filespec", "RichMedia", "XFA", "SubmitForm", "ImportData", "GoToR", "GoToE", "URI"]);
      const staticAnnotations = new Set(["Text", "Link", "FreeText", "Line", "Square", "Circle",
        "Polygon", "PolyLine", "Highlight", "Underline", "Squiggly", "StrikeOut", "Stamp",
        "Caret", "Ink", "Popup", "Watermark", "Redact"]);
      const name = (value: unknown) => value instanceof PDFName ? value.decodeText() : undefined;
      const annotation = (value: unknown) => {
        if (!(value instanceof PDFDict) || !staticAnnotations.has(name(value.lookup(PDFName.of("Subtype"))) ?? "")) throw new Error();
      };
      const seen = new Set<object>();
      const inspect = (value: unknown): void => {
        if (value instanceof PDFRef) {
          const resolved = pdf.context.lookup(value);
          if (!resolved) throw new Error();
          inspect(resolved);
          return;
        }
        if (value instanceof PDFName && forbidden.has(value.decodeText())) throw new Error();
        if (!value || typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (value instanceof PDFDict) {
          const type = name(value.lookup(PDFName.of("Type")));
          const style = name(value.lookup(PDFName.of("S")));
          if (type === "Action") throw new Error();
          if (value.has(PDFName.of("S"))) {
            const staticStyle = (type === "StructElem" && style !== undefined) ||
              (type === "Group" && style === "Transparency") ||
              ((type === undefined || type === "Border") && ["S", "D", "B", "I", "U"].includes(style ?? "")) ||
              ((type === undefined || type === "Mask") && ["Alpha", "Luminosity"].includes(style ?? "") && value.has(PDFName.of("G")));
            if (!staticStyle) throw new Error();
          }
          if (type === "Annot") annotation(value);
          for (const [key, item] of value.entries()) {
            const keyName = key.decodeText();
            // /A is an action entry except for structure-element attributes.
            if ((keyName === "A" && type !== "StructElem") || keyName === "PA" || keyName === "Trans") throw new Error();
            // Embedded/associated files can omit the optional /Type /Filespec.
            if (keyName === "EF" || keyName === "AF") throw new Error();
            if (keyName === "Annots") {
              const annots = value.lookup(key);
              if (!(annots instanceof PDFArray)) throw new Error();
              for (const entry of annots.asArray()) annotation(pdf.context.lookup(entry));
            }
            inspect(key); inspect(item);
          }
        } else if (value instanceof PDFArray) for (const item of value.asArray()) inspect(item);
        else if (value instanceof PDFStream) inspect(value.dict);
      };
      for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
    } else {
      const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS });
      const metadata = await decoder.metadata();
      if (metadata.format !== MIME_FORMATS[file.type as keyof typeof MIME_FORMATS] || (metadata.pages ?? 1) !== 1) throw new Error();
      // Force full decoding: metadata alone accepts truncated/corrupt images.
      await decoder.raw().toBuffer();
    }
  } catch {
    throw new MemberDocumentUploadError("INVALID_DOCUMENT_BYTES");
  }
  return { bytes, type: type as MemberDocumentType, mimeType: file.type,
    originalName: sanitizeName(file.name), byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function createMemberDocument(memberId: number, actorUserId: number, form: FormData) {
  const validated = await validateMemberDocumentUpload(form);
  if (isStorageUrlsDisabled()) throw new MemberDocumentUploadError("STORAGE_UNAVAILABLE", 503);
  const storage = getSupabaseAdmin().storage;
  const bucket = MEMBER_DOCUMENT_BUCKET;
  const configuration = await storage.getBucket(bucket);
  if (configuration.error || configuration.data?.public !== false) {
    throw new MemberDocumentUploadError("PRIVATE_STORAGE_REQUIRED", 503);
  }
  const operationId = randomUUID();
  const key = `member-document-objects/${operationId}`;
  const objects = storage.from(bucket);
  // No deletion on collision, timeout or any ambiguous upload result.
  try {
    const result = await objects.upload(key, validated.bytes, {
      contentType: validated.mimeType, cacheControl: "0", upsert: false,
    });
    if (result.error || result.data?.path !== key) throw new Error();
  } catch {
    signal("UPLOAD_FAILED_OR_UNCERTAIN", operationId);
    throw new MemberDocumentUploadError("STORAGE_UPLOAD_FAILED", 503);
  }
  let callbackCompleted = false;
  try {
    return await prisma.$transaction(async tx => {
      const document = await tx.memberDocument.create({
        data: { memberId, createdByUserId: actorUserId, type: validated.type,
          originalName: validated.originalName, mimeType: validated.mimeType,
          byteLength: validated.byteLength, sha256: validated.sha256, storageBucket: bucket, storageKey: key },
        select: { id: true, type: true, originalName: true, mimeType: true, byteLength: true, createdAt: true },
      });
      // The generic audit helper swallows failures; use the same model inside this transaction.
      await tx.auditLog.create({ data: {
        actorUserId, action: "MEMBER_DOCUMENT_CREATED", entityType: "MemberDocument",
        entityId: String(document.id), summary: "Member document created",
        metadata: { memberId, documentId: document.id, type: document.type,
          byteLength: document.byteLength, mimeType: document.mimeType },
      } });
      callbackCompleted = true;
      return document;
    });
  } catch (error) {
    if (callbackCompleted) {
      // A lost COMMIT acknowledgement can mean the row exists. Preserve its object.
      signal("DB_COMMIT_UNCERTAIN", operationId);
    } else {
      try {
        const cleanup = await objects.remove([key]);
        if (cleanup.error) throw new Error();
      } catch {
        signal("CLEANUP_FAILED", operationId);
      }
      signal("DB_WRITE_FAILED", operationId);
    }
    throw error; // Cleanup must never replace the original DB/audit failure.
  }
}
