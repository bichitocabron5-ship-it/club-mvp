// app/api/purchases/route.ts
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { formatLocalDay } from "@/lib/cash-move";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const MONEY_TOLERANCE = 0.000001;

const purchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  paidAmount: z.coerce.number().min(0).optional(),
  note: z.string().trim().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.coerce.number().positive(),
        availableQty: z.coerce.number().min(0).optional(),
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
  const paidAmount = roundCurrency(parsed.data.paidAmount ?? 0);
  const seenProductIds = new Set<number>();
  const hasDuplicateProduct = items.some((item) => {
    if (seenProductIds.has(item.productId)) {
      return true;
    }

    seenProductIds.add(item.productId);
    return false;
  });

  if (hasDuplicateProduct) {
    return NextResponse.json(
      { error: "No se puede repetir el mismo producto en una compra." },
      { status: 400 }
    );
  }

  const totalAmount = roundCurrency(
    items.reduce((acc, item) => acc + item.qty * item.unitCost, 0)
  );

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return NextResponse.json(
      { error: "El importe pagado no puede ser negativo." },
      { status: 400 }
    );
  }

  if (
    !Number.isFinite(totalAmount) ||
    paidAmount - totalAmount > MONEY_TOLERANCE
  ) {
    return NextResponse.json(
      { error: "El importe pagado no puede superar el total de la compra." },
      { status: 400 }
    );
  }

  const status =
    paidAmount <= 0
      ? "PENDING"
      : totalAmount - paidAmount <= MONEY_TOLERANCE
        ? "PAID"
        : "PARTIAL";
  const actorUserId = Number(auth.session.user.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
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

        if (Number(item.availableQty ?? 0) > Number(item.qty)) {
          throw new Error("La cantidad disponible no puede superar la cantidad comprada");
        }

        const previousStock = Number(product.stock);
        const previousReserveStock = Number(product.reserveStock);
        const availableQty = Math.min(Number(item.availableQty ?? 0), Number(item.qty));
        const reserveQty = Number(item.qty) - availableQty;
        const newStock = previousStock + availableQty;
        const newReserveStock = previousReserveStock + reserveQty;
        const lineTotal = item.qty * item.unitCost;

        const previousAverageCost = Number(product.averageCost || 0);
        const previousPhysicalStock = previousStock + previousReserveStock;
        const newPhysicalStock = previousPhysicalStock + item.qty;

        const newAverageCost =
          newPhysicalStock > 0
            ? (previousPhysicalStock * previousAverageCost + item.qty * item.unitCost) /
              newPhysicalStock
            : item.unitCost;

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            qty: item.qty,
            availableQty,
            reserveQty,
            stockBefore: previousStock,
            stockAfter: newStock,
            reserveStockBefore: previousReserveStock,
            reserveStockAfter: newReserveStock,
            averageCostBefore: previousAverageCost,
            averageCostAfter: newAverageCost,
            unitCost: item.unitCost,
            lineTotal,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
            reserveStock: newReserveStock,
            averageCost: newAverageCost,
          },
        });

        if (availableQty > 0) {
          await tx.stockMove.create({
            data: {
              productId: item.productId,
              type: "IN",
              qty: availableQty,
              previousStock,
              newStock,
              note: `Compra proveedor ${supplier.name} · entrada disponible`,
            },
          });
        }

        await createAuditLog({
          db: tx,
          actorUserId,
          actorEmail: auth.session.user.email,
          action: "PURCHASE_ITEM_STOCK_SPLIT",
          entityType: "PurchaseItem",
          entityId: `${purchase.id}:${item.productId}`,
          summary: `Linea de compra registrada para ${product.name}`,
          metadata: {
            purchaseId: purchase.id,
            productId: item.productId,
            qty: item.qty,
            availableQty,
            reserveQty,
            previousStock,
            newStock,
            previousReserveStock,
            newReserveStock,
            previousAverageCost,
            newAverageCost,
          },
        });
      }

      if (paidAmount > 0) {
        const purchaseExpense = await tx.expense.create({
          data: {
            category: "PROVEEDOR",
            description: `Pago compra proveedor ${supplier.name}`,
            amount: paidAmount,
            paidMethod: "CASH",
            source: "PURCHASE_PAYMENT",
            sourceId: String(purchase.id),
          },
        });

        const purchaseCashMove = await tx.cashMove.create({
          data: {
            type: "expense",
            amount: paidAmount,
            note: `Pago compra proveedor ${supplier.name}`,
            source: "PURCHASE_PAYMENT",
            sourceId: String(purchase.id),
            paymentMethod: "CASH",
            createdByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
            expenseId: purchaseExpense.id,
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
          summary: `Pago inicial de compra registrado para proveedor ${supplier.name}`,
          metadata: {
            purchaseId: purchase.id,
            expenseId: purchaseExpense.id,
            cashMoveId: purchaseCashMove.id,
            amount: paidAmount,
            paymentMethod: "CASH",
          },
        });
      }

      const createdPurchase = await tx.purchase.findUnique({
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

      if (!createdPurchase) {
        throw new Error("Compra no encontrada");
      }

      await tx.auditLog.create({
        data: {
          actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
          actorEmail: auth.session.user.email?.trim().toLowerCase() || null,
          action: "PURCHASE_CREATED",
          entityType: "Purchase",
          entityId: String(purchase.id),
          summary: `Compra creada para proveedor ${supplier.name}`,
          metadata: {
            purchaseId: purchase.id,
            supplierId,
            totalAmount,
            paidAmount,
            items: createdPurchase.items.map((item) => ({
              productId: item.productId,
              qty: Number(item.qty),
              availableQty: Number(item.availableQty),
              reserveQty: Number(item.reserveQty),
              unitCost: Number(item.unitCost),
            })),
          } as Prisma.InputJsonValue,
        },
      });

      return createdPurchase;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando compra" },
      { status: 400 }
    );
  }
}
