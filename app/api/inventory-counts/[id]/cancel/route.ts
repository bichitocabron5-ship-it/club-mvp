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
  ctx: RouteContext<"/api/inventory-counts/[id]/cancel">
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
      });

      if (!count) {
        throw new Error("Conteo no encontrado");
      }

      if (count.status !== "OPEN") {
        throw new Error("Solo se puede cancelar un conteo abierto");
      }

      await tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });

      await createAuditLog({
        db: tx,
        actorUserId: Number.isInteger(actorUserId) ? actorUserId : null,
        actorEmail: auth.session.user.email,
        action: "INVENTORY_COUNT_CANCELLED",
        entityType: "InventoryCount",
        entityId: count.id,
        summary: `Conteo de inventario #${count.id} cancelado`,
        metadata: {
          type: count.type,
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
          error instanceof Error ? error.message : "Error cancelando conteo",
      },
      { status: 400 }
    );
  }
}
