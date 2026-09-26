import { requireStaffOrAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const memberId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(memberId) || memberId > 2_147_483_647) {
    return NextResponse.json({ error: "Socio inválido" }, { status: 400 });
  }
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "Socio no encontrado" }, { status: 404, headers });
    const session = await prisma.signingSession.findFirst({
      // IDs are allocated after the per-member lifecycle lock. createdAt can
      // reflect transaction start before that lock, so it is not lifecycle order.
      where: { memberId }, orderBy: { id: "desc" },
      select: { id: true, status: true, expiresAt: true, token: true, documentSnapshotId: true, contract: { select: { id: true } } },
    });
    if (!session) return NextResponse.json({ session: null }, { headers });
    const status = session.contract ? "SIGNED" : session.status === "PENDING" && session.expiresAt <= new Date() ? "EXPIRED" : session.status;
    return NextResponse.json({ session: {
      id: session.id, status, expiresAt: session.expiresAt.toISOString(),
      signUrl: status === "PENDING" ? new URL(`/sign/${encodeURIComponent(session.token)}`, req.url).toString() : null,
      documentUrl: status === "PENDING" && session.documentSnapshotId
        ? `/api/signing-sessions/${encodeURIComponent(session.token)}?mode=document&expectedDocumentSnapshotId=${encodeURIComponent(session.documentSnapshotId)}` : null,
      contractPdfUrl: session.contract ? `/api/contracts/${session.contract.id}/pdf` : null,
    } }, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar la sesión de firma" }, { status: 500, headers });
  }
}
