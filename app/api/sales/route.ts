// app/api/sales/route.ts
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { isClosureOpen } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import {
  createSaleTransaction,
  RfidAssignmentChangedError,
  SaleValidationError,
  isIdempotencyConflictError,
  SaleOperationType,
} from "@/lib/sales-engine";
import { getTodayRange } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const saleSchema = z.object({
  memberId: z.number().int().positive(),
  expectedRfidCode: z.string().min(1).optional(),
  productId: z.number().int().positive(),
  qty: z.number().positive(),
  idempotencyKey: z.string().trim().uuid().optional(),
});

export async function GET() {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { start, end, day } = getTodayRange();
  const role = auth.session.user.role;
  const actorUserId = Number(auth.session.user.id);
  const isAdmin = role === "ADMIN";

  if (!isAdmin && !Number.isInteger(actorUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  const [closure, sales] = await Promise.all([
    prisma.dayClosure.findUnique({
      where: { day },
      select: {
        status: true,
        reopenedAt: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
        ...(isAdmin ? {} : { appliedByUserId: actorUserId }),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      select: {
        id: true,
        qty: true,
        totalAmount: true,
        finalAmount: true,
        createdAt: true,
        cancelledAt: true,
        cancelReason: true,
        appliedByUserId: true,
        member: {
          select: {
            fullName: true,
          },
        },
        product: {
          select: {
            name: true,
            unit: true,
          },
        },
      },
    }),
  ]);

  const dayClosed = isClosureOpen(closure);

  return NextResponse.json({
    role,
    day,
    dayClosed,
    sales: sales.map((sale) => ({
      id: sale.id,
      qty: Number(sale.qty),
      totalAmount: Number(sale.totalAmount),
      finalAmount: sale.finalAmount === null ? null : Number(sale.finalAmount),
      createdAt: sale.createdAt.toISOString(),
      cancelledAt: sale.cancelledAt?.toISOString() ?? null,
      cancelReason: sale.cancelReason,
      canCancel:
        !sale.cancelledAt &&
        !dayClosed &&
        (isAdmin || sale.appliedByUserId === actorUserId),
      member: sale.member,
      product: sale.product,
    })),
  });
}

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
  const parsed = saleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", code: "SALE_VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { idempotencyKey, memberId, productId, qty } = parsed.data;
  const appliedByUserId = Number(auth.session.user.id);

  if (Number.isNaN(appliedByUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  try {
    const result = await createSaleTransaction({
      memberId,
      expectedRfidCode: parsed.data.expectedRfidCode,
      items: [{ productId, qty }],
      operatorUserId: appliedByUserId,
      operatorEmail: auth.session.user.email,
      operationType: SaleOperationType.SINGLE,
      idempotencyKey,
    });

    return NextResponse.json(result.sales[0]);
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
