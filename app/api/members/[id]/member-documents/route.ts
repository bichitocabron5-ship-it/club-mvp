import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { createMemberDocument, MemberDocumentUploadError, MEMBER_DOCUMENT_REQUEST_MAX_BYTES } from "@/lib/member-document-writer";

export const runtime = "nodejs";

// Bound the actual stream as well as Content-Length before parsing multipart.
async function readForm(req: Request) {
  if (!/^multipart\/form-data\s*;/i.test(req.headers.get("content-type") ?? "")) {
    throw new MemberDocumentUploadError("MULTIPART_REQUIRED", 415);
  }
  const length = req.headers.get("content-length");
  if (length && Number(length) > MEMBER_DOCUMENT_REQUEST_MAX_BYTES) throw new MemberDocumentUploadError("REQUEST_TOO_LARGE", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new MemberDocumentUploadError("INVALID_FORM");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MEMBER_DOCUMENT_REQUEST_MAX_BYTES) {
        await reader.cancel();
        throw new MemberDocumentUploadError("REQUEST_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "content-type": req.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof MemberDocumentUploadError) throw error;
    throw new MemberDocumentUploadError("INVALID_FORM");
  } finally { reader.releaseLock(); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const memberId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
      return Response.json({ error: "INVALID_MEMBER_ID" }, { status: 400 });
    }
    if (!await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })) {
      return Response.json({ error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }
    const document = await createMemberDocument(memberId, Number(auth.session.user.id), await readForm(req));
    return Response.json(document, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MemberDocumentUploadError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "MEMBER_DOCUMENT_CREATE_FAILED" }, { status: 500 });
  }
}
