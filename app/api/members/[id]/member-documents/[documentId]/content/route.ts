import { readVerifiedMemberDocument } from "@/lib/member-document-reader";
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { isStorageUrlsDisabled } from "@/lib/storage";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
function validId(value: string) {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2_147_483_647;
}
function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers });
}

// Next.js derives HEAD from GET, preserving auth, ownership and integrity.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) return failure(auth.error, auth.status);
    const { id, documentId } = await params;
    if (!validId(id) || !validId(documentId)) return failure("INVALID_DOCUMENT_ID", 400);
    const query = new URL(req.url).searchParams;
    const disposition = query.get("disposition") ?? "inline";
    if ([...query.keys()].some(key => key !== "disposition") || query.getAll("disposition").length > 1 ||
        (disposition !== "inline" && disposition !== "attachment")) return failure("INVALID_DOCUMENT_QUERY", 400);
    const document = await prisma.memberDocument.findFirst({
      where: { id: Number(documentId), memberId: Number(id) },
      select: { id: true, mimeType: true, byteLength: true, sha256: true, storageBucket: true, storageKey: true },
    });
    if (!document) return failure("DOCUMENT_NOT_FOUND", 404);

    // Fully buffer and verify before constructing any content response. Storage
    // failures are unavailable; auth/DB failures retain the generic outer 500.
    try {
      if (isStorageUrlsDisabled()) return failure("DOCUMENT_UNAVAILABLE", 503);
      const { bytes, mimeType: mime, byteLength, extension } = await readVerifiedMemberDocument(document);
      return new Response(bytes, { headers: { ...headers,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Content-Type": mime,
        "Content-Length": String(byteLength),
        "Content-Disposition": `${disposition}; filename="document-${document.id}.${extension}"`,
      } });
    } catch {
      return failure("DOCUMENT_UNAVAILABLE", 503);
    }
  } catch {
    return failure("MEMBER_DOCUMENT_CONTENT_FAILED", 500);
  }
}
