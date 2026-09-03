// app/api/purchases/[id]/pay/route.ts
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import {
  formatLocalDay,
  normalizeCashMovePaymentMethod,
} from "@/lib/cash-move";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const MONEY_TOLERANCE = 0.000001;

const paySchema = z.object({
  amount: z.coerce.number().positive(),
  paidMethod: z.string().trim().min(1).optional(),
});

class PurchasePaymentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PurchasePaymentError";
    this.status = status;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const purchaseId = Number(id);

  if (
    Number.isNaN(purchaseId) ||
    !Number.isInteger(purchaseId) ||
    purchaseId <= 0
  ) {
    return NextResponse.json({ error: "Compra inválida" }, { status: 400 });
  }

  const body = await req.json();

  const parsed = paySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const paymentAmount = roundCurrency(parsed.data.amount);
  const paidMethod = normalizeCashMovePaymentMethod(parsed.data.paidMethod);
  const actorUserId = Number(auth.session.user.id);

  if (paymentAmount <= 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        include: { supplier: true },
      });

      if (!purchase) {
        throw new PurchasePaymentError("Compra no encontrada", 404);
      }

      if (purchase.cancelledAt || purchase.status === "CANCELLED") {
        throw new PurchasePaymentError(
          "No se pueden registrar pagos en una compra anulada",
          409
        );
      }

      const totalAmount = roundCurrency(Number(purchase.totalAmount));
      const paidAmount = roundCurrency(Number(purchase.paidAmount));
      const pendingAmount = roundCurrency(totalAmount - paidAmount);

      if (pendingAmount <= MONEY_TOLERANCE) {
        throw new PurchasePaymentError("Esta compra ya esta pagada", 409);
      }

      if (paymentAmount - pendingAmount > MONEY_TOLERANCE) {
        throw new PurchasePaymentError(
          "El pago supera la deuda pendiente",
          400
        );
      }

      const newPaidAmount = roundCurrency(paidAmount + paymentAmount);

      const status =
        totalAmount - newPaidAmount <= MONEY_TOLERANCE
          ? "PAID"
          : newPaidAmount > 0
            ? "PARTIAL"
            : "PENDING";

      const updatedPurchase = await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          paidAmount: newPaidAmount,
          status,
        },
        include: {
          supplier: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      const paymentExpense = await tx.expense.create({
        data: {
          category: "PROVEEDOR",
          description: `Pago deuda proveedor ${purchase.supplier.name}`,
          amount: paymentAmount,
          paidMethod,
          source: "PURCHASE_PAYMENT",
          sourceId: String(purchase.id),
        },
      });

      const paymentCashMove = await tx.cashMove.create({
        data: {
          type: "expense",
          amount: paymentAmount,
          note: `Pago deuda proveedor ${purchase.supplier.name}`,
          source: "PURCHASE_PAYMENT",
          sourceId: String(purchase.id),
          paymentMethod: paidMethod,
          createdByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
          expenseId: paymentExpense.id,
          day: formatLocalDay(),
        },
      });

      await createAuditLog({
        db: tx,
        actorUserId,
        actorEmail: auth.session.user.email,
        action: "PURCHASE_PAYMENT_CREATED",
        entityType: "Purchase",
        entityId: purchase.id,
        summary: `Pago de compra registrado para proveedor ${purchase.supplier.name}`,
        metadata: {
          purchaseId: purchase.id,
          expenseId: paymentExpense.id,
          cashMoveId: paymentCashMove.id,
          amount: paymentAmount,
          paymentMethod: paidMethod,
          resultingStatus: updatedPurchase.status,
        },
      });

      return updatedPurchase;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PurchasePaymentError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo registrar el pago por concurrencia. Vuelve a intentarlo.",
        },
        { status: 409 }
      );
    }

    console.error("[api/purchases/[id]/pay] Failed to register payment", err);

    return NextResponse.json(
      {
        error: "Error registrando pago",
      },
      { status: 500 }
    );
  }
}
