// app/api/sales/route.ts
import { requireAuth } from "@/lib/auth-server";
import { createSaleTransaction } from "@/lib/sales-engine";
import { getErrorMessage } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const saleSchema = z.object({
  memberId: z.number().int().positive(),
  productId: z.number().int().positive(),
  qty: z.number().positive(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = saleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { memberId, productId, qty } = parsed.data;
  const appliedByUserId = Number(auth.session.user.id);

  if (Number.isNaN(appliedByUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  try {
    const result = await createSaleTransaction({
      memberId,
      items: [{ productId, qty }],
      operatorUserId: appliedByUserId,
    });

    return NextResponse.json(result.sales[0]);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Error en la venta") },
      { status: 400 }
    );
  }
}
