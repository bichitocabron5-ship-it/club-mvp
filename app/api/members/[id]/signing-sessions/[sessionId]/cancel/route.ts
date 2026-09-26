import { requireStaffOrAdmin } from "@/lib/auth-server";
import { cancelSigningSession, SigningLifecycleError } from "@/lib/signing-session-lifecycle";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2_147_483_647));

export async function POST(_req: Request, { params }: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const values = await params;
  const memberId = idSchema.safeParse(values.id);
  const sessionId = idSchema.safeParse(values.sessionId);
  if (!memberId.success || !sessionId.success) return NextResponse.json({ error: "Identificador inválido" }, { status: 400 });
  try {
    const result = await cancelSigningSession(memberId.data, sessionId.data, {
      id: Number(auth.session.user.id), email: auth.session.user.email ?? null,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SigningLifecycleError) return NextResponse.json({ error: error.code }, { status: error.status });
    return NextResponse.json({ error: "No se pudo cancelar la sesión de firma" }, { status: 500 });
  }
}
