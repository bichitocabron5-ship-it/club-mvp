import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { createMemberDocument, MemberDocumentUploadError } from "@/lib/member-document-writer";
import { readMemberDocumentForm } from "@/lib/member-document-form";

export const runtime = "nodejs";


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
