import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { createMemberDocument, MemberDocumentUploadError } from "@/lib/member-document-writer";
import { readMemberDocumentForm } from "@/lib/member-document-form";
import { listMemberDocuments, MemberDocumentListInputError, parseMemberDocumentListOptions } from "@/lib/member-document-list";

export const runtime = "nodejs";

const listHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireStaffOrAdmin();
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: listHeaders });
    const { id } = await params;
    const memberId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
      return Response.json({ error: "INVALID_MEMBER_ID" }, { status: 400, headers: listHeaders });
    }
    const options = parseMemberDocumentListOptions(new URL(req.url), memberId);
    if (!await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })) {
      return Response.json({ error: "MEMBER_NOT_FOUND" }, { status: 404, headers: listHeaders });
    }
    return Response.json(await listMemberDocuments(memberId, options), { headers: listHeaders });
  } catch (error) {
    if (error instanceof MemberDocumentListInputError) {
      return Response.json({ error: "INVALID_DOCUMENT_LIST_QUERY" }, { status: 400, headers: listHeaders });
    }
    return Response.json({ error: "MEMBER_DOCUMENT_LIST_FAILED" }, { status: 500, headers: listHeaders });
  }
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
    const document = await createMemberDocument(memberId, Number(auth.session.user.id), await readMemberDocumentForm(req));
    return Response.json(document, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MemberDocumentUploadError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "MEMBER_DOCUMENT_CREATE_FAILED" }, { status: 500 });
  }
}
