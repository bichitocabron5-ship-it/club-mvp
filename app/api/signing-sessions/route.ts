import { requireStaffOrAdmin } from "@/lib/auth-server";
import { findActiveContractTemplate } from "@/lib/contract-templates";
import { SigningTemplateError } from "@/lib/contract-storage";
import { prisma } from "@/lib/prisma";
import { requireSessionDocumentSnapshot, serializeInternalSigningSession } from "@/lib/signing-session";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { createOrReissueSigningSession, SigningLifecycleError } from "@/lib/signing-session-lifecycle";
import { z } from "zod";

const sessionSchema = z.object({ memberId: z.number().int().positive().max(2_147_483_647) }).strict();

export async function POST(req: Request) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Socio inválido" }, { status: 400 });
  try {
    const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    // Select once, only in this authorized creation flow.
    const template = await findActiveContractTemplate();
    if (!template) return NextResponse.json({ error: "No hay plantilla de contrato activa configurada" }, { status: 400 });
    if (!template.documentSnapshotId) {
      return NextResponse.json({ code: "SIGNING_TEMPLATE_SNAPSHOT_REQUIRED", error: "La plantilla no tiene snapshot. Configura una nueva plantilla válida." }, { status: 409 });
    }
    await requireSessionDocumentSnapshot(template);
    const session = await createOrReissueSigningSession({
      memberId: member.id, templateId: template.id, documentSnapshotId: template.documentSnapshotId,
      actor: { id: Number(auth.session.user.id), email: auth.session.user.email ?? null },
    });
    return NextResponse.json(await serializeInternalSigningSession(session, req));
  } catch (error) {
    if (error instanceof SigningLifecycleError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    if (error instanceof SigningTemplateError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    // Never silently replace a selected member/template that disappeared.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "El socio o la plantilla ya no están disponibles. Crea una nueva sesión." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear la sesión de firma" }, { status: 500 });
  }
}
