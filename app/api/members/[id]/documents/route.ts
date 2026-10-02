import { createHash } from "node:crypto";
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { resolveMemberDni } from "@/lib/member-dni";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isStorageUrlsDisabled } from "@/lib/storage";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const formats: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

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
    const download = await getSupabaseAdmin().storage.from(document.storageBucket).download(document.storageKey);
    if (download.error || !download.data) throw new Error();
    const bytes = await download.data.arrayBuffer();
    // Never fall back to legacy on corruption or a missing canonical object.
    const mime = document.source === "new" ? document.mimeType : download.data.type;
    if (!Object.hasOwn(formats, mime)) throw new Error();
    if (document.source === "new" && (bytes.byteLength !== document.byteLength ||
        createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== document.sha256)) throw new Error();
    return new Response(bytes, { headers: { ...headers,
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="dni-${side}.${formats[mime]}"`,
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
