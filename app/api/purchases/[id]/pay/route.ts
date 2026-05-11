// app/api/purchases/[id]/pay/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const paySchema = z.object({
  amount: z.coerce.number().positive(),
  paidMethod: z.string().trim().min(1).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const purchaseId = Number(id);
  const body = await req.json();

  if (!purchaseId || Number.isNaN(purchaseId)) {
    return NextResponse.json({ error: "Compra inválida" }, { status: 400 });
  }

  const parsed = paySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const paymentAmount = parsed.data.amount;
  const paidMethod = parsed.data.paidMethod || "CASH";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: purchaseId },
        include: { supplier: true },
      });

      if (!purchase) {
        throw new Error("Compra no encontrada");
      }

      const totalAmount = Number(purchase.totalAmount);
      const paidAmount = Number(purchase.paidAmount);
      const pendingAmount = totalAmount - paidAmount;

      if (pendingAmount <= 0) {
        throw new Error("Esta compra ya está pagada");
      }

      if (paymentAmount > pendingAmount) {
        throw new Error("El pago supera la deuda pendiente");
      }

      const newPaidAmount = paidAmount + paymentAmount;

      const status =
        newPaidAmount >= totalAmount
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

      await tx.expense.create({
        data: {
          category: "PROVEEDOR",
          description: `Pago deuda proveedor ${purchase.supplier.name}`,
          amount: paymentAmount,
          paidMethod,
        },
      });

      await tx.cashMove.create({
        data: {
          type: "expense",
          amount: paymentAmount,
          note: `Pago deuda proveedor ${purchase.supplier.name}`,
        },
      });

      return updatedPurchase;
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error registrando pago",
      },
      { status: 400 }
    );
  }
}