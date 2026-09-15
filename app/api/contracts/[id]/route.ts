import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

// Recognize the legacy request only to reject it explicitly for signed records.
const contractSchema = z.object({
  consumptionGrams: z.number().int().positive().max(2_147_483_647).nullable(),
}).strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const contractId = Number(id);

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(contractId) || contractId > 2_147_483_647) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    const parsed = contractSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }

    const contract = await prisma.memberContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) {
      return NextResponse.json({ code: "CONTRACT_NOT_FOUND", error: "Contrato no encontrado" }, { status: 404 });
    }

    // Every existing MemberContract is signed, including legacy rows without a session/PDF.
    return NextResponse.json({
      code: "SIGNED_CONTRACT_IMMUTABLE",
      error: "El contrato firmado no puede modificarse. Se requiere una nueva firma.",
    }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
