import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import { serializeInventoryCountDetail } from "@/lib/inventory-counts";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.coerce.number().int().positive();

const inventoryCountInclude = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  confirmedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          unit: true,
          stock: true,
          active: true,
        },
      },
    },
    orderBy: {
      product: {
        name: "asc",
      },
    },
  },
} as const;

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/inventory-counts/[id]/confirm">
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await ctx.params;
  const parsedId = paramsSchema.safeParse(rawId);

  if (!parsedId.success) {
    return NextResponse.json({ error: "Id invalido" }, { status: 400 });
  }

  const actorUserId = Number(auth.session.user.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.inventoryCount.findUnique({
        where: { id: parsedId.data },
        include: {
          items: true,
        },
      });

      if (!count) {
        throw new Error("Conteo no encontrado");
      }

      if (count.status !== "OPEN") {
        throw new Error("Solo se puede confirmar un conteo abierto");
      }

      let adjustedItems = 0;

      for (const item of count.items) {
        if (item.countedQty === null) {
          continue;
        }

        const differenceQty =
          item.differenceQty ?? item.countedQty - Number(item.expectedQty);

        if (differenceQty === 0) {
          continue;
        }

        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Producto #${item.productId} no encontrado`);
        }

        const previousStock = Number(product.stock);
        const newStock = Number(item.countedQty);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
          },
        });

        await tx.stockMove.create({
          data: {
            productId: item.productId,
            type: "INVENTORY_ADJUSTMENT",
            qty: Math.abs(Number(differenceQty)),
            previousStock,
            newStock,
            note: `Conteo #${count.id} (${count.type})${item.note ? ` - ${item.note}` : ""}`,
          },
        });

        adjustedItems += 1;
      }

      await tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          status: "CONFIRMED",
          confirmedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
          confirmedAt: new Date(),
        },
      });

      await createAuditLog({
        db: tx,
        actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
        actorEmail: auth.session.user.email,
        action: "INVENTORY_COUNT_CONFIRMED",
        entityType: "InventoryCount",
        entityId: count.id,
        summary: `Conteo de inventario #${count.id} confirmado`,
        metadata: {
          type: count.type,
          adjustedItems,
          totalItems: count.items.length,
        },
      });

      return tx.inventoryCount.findUnique({
        where: { id: count.id },
        include: inventoryCountInclude,
      });
    });

    if (!result) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }

    return NextResponse.json(serializeInventoryCountDetail(result));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error confirmando conteo",
      },
      { status: 400 }
    );
  }
}
