import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { createMemberDocument, MemberDocumentUploadError } from "@/lib/member-document-writer";
import { readMemberDocumentForm } from "@/lib/member-document-form";
import { memberDniContentUrl } from "@/lib/member-dni";

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
    const input = await readMemberDocumentForm(req);
    const side = input.get("side");
    if ([...input.keys()].length !== 2 || input.getAll("side").length !== 1 || input.getAll("image").length !== 1 ||
        (side !== "front" && side !== "back")) throw new MemberDocumentUploadError("INVALID_FIELDS");
    const file = input.get("image");
    if (!(file instanceof File)) throw new MemberDocumentUploadError("DOCUMENT_EMPTY");
    // Preserve the image-only UI contract. Byte validation belongs to the sole writer.
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new MemberDocumentUploadError("UNSUPPORTED_MIME", 415);
    const form = new FormData();
    form.set("file", file);
    form.set("type", side === "front" ? "ID_FRONT" : "ID_BACK");
    const document = await createMemberDocument(memberId, Number(auth.session.user.id), form);
    // Refresh an already mounted image even though this URL always resolves current.
    return Response.json({ [side === "front" ? "dniFrontUrl" : "dniBackUrl"]: `${memberDniContentUrl(memberId, side)}&revision=${document.id}` },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MemberDocumentUploadError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "MEMBER_DOCUMENT_CREATE_FAILED" }, { status: 500 });
  }
}
