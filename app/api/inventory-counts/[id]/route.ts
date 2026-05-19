import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth-server";
import { serializeInventoryCountDetail } from "@/lib/inventory-counts";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.coerce.number().int().positive();

const updateInventoryCountSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        countedQty: z.coerce.number().min(0).nullable(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
    )
    .min(1),
});

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

async function getInventoryCount(id: number) {
  return prisma.inventoryCount.findUnique({
    where: { id },
    include: inventoryCountInclude,
  });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/inventory-counts/[id]">) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await ctx.params;
  const parsedId = paramsSchema.safeParse(rawId);

  if (!parsedId.success) {
    return NextResponse.json({ error: "Id invalido" }, { status: 400 });
  }

  const count = await getInventoryCount(parsedId.data);

  if (!count) {
    return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(serializeInventoryCountDetail(count));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/inventory-counts/[id]">) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: rawId } = await ctx.params;
  const parsedId = paramsSchema.safeParse(rawId);

  if (!parsedId.success) {
    return NextResponse.json({ error: "Id invalido" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateInventoryCountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const currentCount = await prisma.inventoryCount.findUnique({
    where: { id: parsedId.data },
    include: {
      items: true,
    },
  });

  if (!currentCount) {
    return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
  }

  if (currentCount.status !== "OPEN") {
    return NextResponse.json(
      { error: "Solo se puede editar un conteo abierto" },
      { status: 400 }
    );
  }

  const validItemIds = new Set(currentCount.items.map((item) => item.id));
  const invalidItem = parsed.data.items.find((item) => !validItemIds.has(item.id));

  if (invalidItem) {
    return NextResponse.json(
      { error: "Hay lineas que no pertenecen al conteo" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const item of parsed.data.items) {
      const currentItem = currentCount.items.find((row) => row.id === item.id);

      if (!currentItem) {
        continue;
      }

      const countedQty = item.countedQty;
      const differenceQty =
        countedQty === null ? null : countedQty - Number(currentItem.expectedQty);

      await tx.inventoryCountItem.update({
        where: { id: item.id },
        data: {
          countedQty,
          differenceQty,
          note: item.note?.trim() || null,
        },
      });
    }
  });

  const updatedCount = await getInventoryCount(parsedId.data);

  if (!updatedCount) {
    return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
  }

  await createAuditLog({
    actorUserId: Number(auth.session.user.id),
    actorEmail: auth.session.user.email,
    action: "INVENTORY_COUNT_UPDATED",
    entityType: "InventoryCount",
    entityId: updatedCount.id,
    summary: `Conteo de inventario #${updatedCount.id} actualizado`,
    metadata: {
      updatedItems: parsed.data.items.length,
    },
  });

  return NextResponse.json(serializeInventoryCountDetail(updatedCount));
}
