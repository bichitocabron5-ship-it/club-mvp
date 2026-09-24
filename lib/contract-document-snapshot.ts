import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type ContractDocumentSnapshot } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";

// Keep the SQL size CHECK aligned. The existing renderer requires three pages.
export const CONTRACT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CONTRACT_DOCUMENT_MIN_PAGES = 3;

type SnapshotErrorCode =
  | "DOCUMENT_EMPTY"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_INVALID_PDF"
  | "DOCUMENT_INSUFFICIENT_PAGES"
  | "DOCUMENT_SNAPSHOT_CORRUPT";

export class ContractDocumentSnapshotError extends Error {
  constructor(readonly code: SnapshotErrorCode) {
    super(code);
    this.name = "ContractDocumentSnapshotError";
  }
}

function checkSize(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new ContractDocumentSnapshotError("DOCUMENT_EMPTY");
  if (bytes.byteLength > CONTRACT_DOCUMENT_MAX_BYTES) {
    throw new ContractDocumentSnapshotError("DOCUMENT_TOO_LARGE");
  }
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function validatePdf(bytes: Uint8Array) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  } catch {
    throw new ContractDocumentSnapshotError("DOCUMENT_INVALID_PDF");
  }
  if (pdf.getPageCount() < CONTRACT_DOCUMENT_MIN_PAGES) {
    throw new ContractDocumentSnapshotError("DOCUMENT_INSUFFICIENT_PAGES");
  }
}

/** Internal only: returns a detached, verified copy, never a public DTO. */
export async function verifyContractDocumentSnapshot(snapshot: ContractDocumentSnapshot) {
  checkSize(snapshot.bytes);
  // Detach before any await: caller mutations cannot change the validated buffer.
  const verified = { ...snapshot, bytes: Buffer.from(snapshot.bytes) };
  if (!Number.isInteger(verified.byteLength) ||
      verified.byteLength !== verified.bytes.byteLength ||
      !/^[0-9a-f]{64}$/.test(verified.sha256) ||
      sha256(verified.bytes) !== verified.sha256) {
    throw new ContractDocumentSnapshotError("DOCUMENT_SNAPSHOT_CORRUPT");
  }
  await validatePdf(verified.bytes);
  return verified;
}

async function verifyMatchingSnapshot(snapshot: ContractDocumentSnapshot, expected: Buffer) {
  const verified = await verifyContractDocumentSnapshot(snapshot);
  // Check equality as well as the digest: never reuse a different byte sequence.
  if (!verified.bytes.equals(expected)) {
    throw new ContractDocumentSnapshotError("DOCUMENT_SNAPSHOT_CORRUPT");
  }
  return verified;
}

/** Standalone DB operations, not an interactive transaction: P2002 recovery needs
 * a usable connection after the failed INSERT. No template/legacy association writes.
 */
export async function createOrReuseContractDocumentSnapshot(input: Uint8Array) {
  checkSize(input);
  const bytes = Buffer.from(input);
  const digest = sha256(bytes); // Original bytes, never PDFDocument.save().
  await validatePdf(bytes);

  const existing = await prisma.contractDocumentSnapshot.findUnique({ where: { sha256: digest } });
  if (existing) return verifyMatchingSnapshot(existing, bytes);

  let created: ContractDocumentSnapshot;
  try {
    created = await prisma.contractDocumentSnapshot.create({
      data: { sha256: digest, bytes, byteLength: bytes.byteLength },
    });
  } catch (error) {
    // Only recover the expected digest unique race; unrelated failures propagate.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const target = error.meta?.target;
    if (!(Array.isArray(target) ? target.length === 1 && target[0] === "sha256"
      : target === "sha256" || target === "ContractDocumentSnapshot_sha256_key")) throw error;
    const winner = await prisma.contractDocumentSnapshot.findUnique({ where: { sha256: digest } });
    if (!winner) throw error;
    return verifyMatchingSnapshot(winner, bytes);
  }
  return verifyMatchingSnapshot(created, bytes);
}
