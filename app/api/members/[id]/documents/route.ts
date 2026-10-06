import { readVerifiedMemberDocument, memberDocumentReadExtension } from "@/lib/member-document-reader";
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { resolveMemberDni } from "@/lib/member-dni";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isStorageUrlsDisabled } from "@/lib/storage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers });
    const { id } = await params;
    const memberId = Number(id);
    const side = new URL(req.url).searchParams.get("side");
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647 || (side !== "front" && side !== "back")) {
      return Response.json({ error: "INVALID_DOCUMENT" }, { status: 400, headers });
    }
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { dniFrontUrl: true, dniBackUrl: true } });
    if (!member) return Response.json({ error: "MEMBER_NOT_FOUND" }, { status: 404, headers });
    const document = await resolveMemberDni(memberId, side, side === "front" ? member.dniFrontUrl : member.dniBackUrl);
    if (!document) return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404, headers });
    if (isStorageUrlsDisabled()) return Response.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503, headers });
    // A failed canonical read must never enter the legacy branch.
    let bytes: ArrayBuffer;
    let mime: string;
    let extension: string | null;
    if (document.source === "new") {
      const verified = await readVerifiedMemberDocument(document);
      ({ bytes, mimeType: mime, extension } = verified);
    } else {
      const download = await getSupabaseAdmin().storage.from(document.storageBucket).download(document.storageKey);
      if (download.error || !download.data) throw new Error();
      bytes = await download.data.arrayBuffer();
      mime = download.data.type;
      extension = memberDocumentReadExtension(mime);
      if (!extension) throw new Error();
    }
    return new Response(bytes, { headers: { ...headers,
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="dni-${side}.${extension}"`,
      "Content-Security-Policy": "sandbox",
    } });
  } catch {
    return Response.json({ error: "DOCUMENT_UNAVAILABLE" }, { status: 503, headers });
  }
}

// No in-repository consumer uses this alternate writer. Preserve authenticated
// GET; new uploads use /dni or the canonical API and its single writer.
export async function POST() {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers });
  return Response.json({ error: "DOCUMENT_WRITER_RETIRED" }, { status: 410, headers });
}
