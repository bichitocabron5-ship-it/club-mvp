// app/api/purchases/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const purchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  paidAmount: z.coerce.number().min(0).optional(),
  note: z.string().trim().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0),
      })
    )
    .min(1),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const purchases = await prisma.purchase.findMany({
    include: {
      supplier: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(purchases);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = purchaseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { supplierId, items, note } = parsed.data;
  const paidAmount = parsed.data.paidAmount ?? 0;

  const totalAmount = items.reduce(
    (acc, item) => acc + item.qty * item.unitCost,
    0
  );

  const status =
    paidAmount <= 0 ? "PENDING" : paidAmount >= totalAmount ? "PAID" : "PARTIAL";

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
      });

      if (!supplier) {
        throw new Error("Proveedor no encontrado");
      }

      const purchase = await tx.purchase.create({
        data: {
          supplierId,
          totalAmount,
          paidAmount,
          status,
          note: note || null,
        },
      });

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error("Producto no encontrado");
        }

        const previousStock = Number(product.stock);
        const newStock = previousStock + item.qty;
        const lineTotal = item.qty * item.unitCost;

        const previousAverageCost = Number(product.averageCost || 0);

        const newAverageCost =
          newStock > 0
            ? (previousStock * previousAverageCost + item.qty * item.unitCost) /
              newStock
            : item.unitCost;

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            qty: item.qty,
            unitCost: item.unitCost,
            lineTotal,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
            averageCost: newAverageCost,
          },
        });

        await tx.stockMove.create({
          data: {
            productId: item.productId,
            type: "IN",
            qty: item.qty,
            previousStock,
            newStock,
            note: `Compra proveedor ${supplier.name}`,
          },
        });
      }

      if (paidAmount > 0) {
        await tx.expense.create({
          data: {
            category: "PROVEEDOR",
            description: `Pago compra proveedor ${supplier.name}`,
            amount: paidAmount,
            paidMethod: "CASH",
          },
        });

        await tx.cashMove.create({
          data: {
            type: "expense",
            amount: paidAmount,
            note: `Pago compra proveedor ${supplier.name}`,
          },
        });
      }

      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: {
          supplier: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando compra" },
      { status: 400 }
    );
  }
}
