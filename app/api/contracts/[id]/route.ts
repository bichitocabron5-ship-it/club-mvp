import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const contractSchema = z.object({
  consumptionGrams: z.number().int().positive().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const contractId = Number(id);

  if (!contractId || Number.isNaN(contractId)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = contractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const contract = await prisma.memberContract.update({
    where: { id: contractId },
    data: {
      consumptionGrams: parsed.data.consumptionGrams,
    },
    include: {
      contractTemplate: true,
    },
  });

  return NextResponse.json(contract);
}
