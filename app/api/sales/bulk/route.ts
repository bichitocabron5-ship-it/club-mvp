import { requireStaffOrAdmin } from "@/lib/auth-server";
import {
  createSaleTransaction,
  RfidAssignmentChangedError,
  SaleValidationError,
  isIdempotencyConflictError,
  SaleOperationType,
} from "@/lib/sales-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const bulkSaleSchema = z.object({
  memberId: z.number().int().positive(),
  expectedRfidCode: z.string().min(1).optional(),
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

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      return NextResponse.json(
        { error: "No se pudo confirmar el resultado de la venta.", code: "SALE_RESULT_UNCONFIRMED" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "Datos invalidos", code: "SALE_VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  const parsed = bulkSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", code: "SALE_VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { idempotencyKey, memberId, items } = parsed.data;
  const appliedByUserId = Number(auth.session.user.id);

  if (Number.isNaN(appliedByUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  try {
    const result = await createSaleTransaction({
      memberId,
      expectedRfidCode: parsed.data.expectedRfidCode,
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
    if (error instanceof RfidAssignmentChangedError) {
      return NextResponse.json(
        { error: error.message, code: "RFID_ASSIGNMENT_CHANGED" },
        { status: 409 }
      );
    }
    if (isIdempotencyConflictError(error)) {
      return NextResponse.json(
        { error: error.message, code: "IDEMPOTENCY_CONFLICT" },
        { status: 409 }
      );
    }

    if (error instanceof SaleValidationError) {
      return NextResponse.json(
        { error: error.message, code: "SALE_VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "No se pudo confirmar el resultado de la venta.", code: "SALE_RESULT_UNCONFIRMED" },
      { status: 500 }
    );
  }
}
