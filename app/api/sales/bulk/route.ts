import { requireAuth } from "@/lib/auth-server";
import { createSaleTransaction } from "@/lib/sales-engine";
import { getErrorMessage } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const bulkSaleSchema = z.object({
  memberId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().positive(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = bulkSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { memberId, items } = parsed.data;
  const appliedByUserId = Number(auth.session.user.id);

  if (Number.isNaN(appliedByUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  try {
    const result = await createSaleTransaction({
      memberId,
      items,
      operatorUserId: appliedByUserId,
      operatorEmail: auth.session.user.email,
    });

    return NextResponse.json({
      sales: result.sales,
      totalAmount: result.totalAmount,
      originalAmount: result.originalAmount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al registrar retirada") },
      { status: 400 }
    );
  }
}
