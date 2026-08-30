import { requireStaffOrAdmin } from "@/lib/auth-server";
import {
  createSaleTransaction,
  isIdempotencyConflictError,
  SaleOperationType,
} from "@/lib/sales-engine";
import { getErrorMessage } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const bulkSaleSchema = z.object({
  memberId: z.number().int().positive(),
  idempotencyKey: z.string().trim().uuid().optional(),
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
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = bulkSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { idempotencyKey, memberId, items } = parsed.data;
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
      operationType: SaleOperationType.BULK,
      idempotencyKey,
    });

    return NextResponse.json({
      sales: result.sales,
      totalAmount: result.totalAmount,
      originalAmount: result.originalAmount,
    });
  } catch (error: unknown) {
    if (isIdempotencyConflictError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: getErrorMessage(error, "Error al registrar retirada") },
      { status: 400 }
    );
  }
}
