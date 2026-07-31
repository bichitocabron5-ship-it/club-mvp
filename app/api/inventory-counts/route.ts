import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth-server";
import {
  INVENTORY_COUNT_TYPES,
  serializeInventoryCountListItem,
} from "@/lib/inventory-counts";
import { prisma } from "@/lib/prisma";

const createInventoryCountSchema = z.object({
  type: z.enum(INVENTORY_COUNT_TYPES),
  notes: z.string().trim().max(2000).optional().nullable(),
  productIds: z.array(z.number().int().positive()).optional(),
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
  items: true,
} as const;

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const counts = await prisma.inventoryCount.findMany({
    include: inventoryCountInclude,
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return NextResponse.json(counts.map(serializeInventoryCountListItem));
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = createInventoryCountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { type, productIds, notes } = parsed.data;
  const uniqueProductIds = Array.from(new Set(productIds ?? []));

  if (type === "PARTIAL" && uniqueProductIds.length === 0) {
    return NextResponse.json(
      { error: "Un conteo parcial requiere productos seleccionados" },
      { status: 400 }
    );
  }

  const products = await prisma.product.findMany({
    where: uniqueProductIds.length
      ? {
          id: {
            in: uniqueProductIds,
          },
        }
      : type === "PARTIAL"
        ? {
            id: -1,
          }
        : {
            active: true,
          },
    select: {
      id: true,
      stock: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (uniqueProductIds.length > 0 && products.length !== uniqueProductIds.length) {
    return NextResponse.json(
      { error: "Hay productos seleccionados que no existen" },
      { status: 400 }
    );
  }

  if (products.length === 0) {
    return NextResponse.json(
      { error: "No hay productos para crear el conteo" },
      { status: 400 }
    );
  }

  const userId = Number(auth.session.user.id);

  const count = await prisma.$transaction(async (tx) => {
    const createdCount = await tx.inventoryCount.create({
      data: {
        type,
        notes: notes?.trim() || null,
        createdByUserId: Number.isInteger(userId) ? userId : null,
      },
    });

    await tx.inventoryCountItem.createMany({
      data: products.map((product) => ({
        inventoryCountId: createdCount.id,
        productId: product.id,
        expectedQty: Number(product.stock),
      })),
    });

    const createdWithItems = await tx.inventoryCount.findUnique({
      where: { id: createdCount.id },
      include: inventoryCountInclude,
    });

    if (!createdWithItems) {
      throw new Error("Conteo no encontrado");
    }

    return createdWithItems;
  });

  await createAuditLog({
    actorUserId: Number.isInteger(userId) ? userId : null,
    actorEmail: auth.session.user.email,
    action: "INVENTORY_COUNT_CREATED",
    entityType: "InventoryCount",
    entityId: count.id,
    summary: `Conteo de inventario #${count.id} creado`,
    metadata: {
      type: count.type,
      status: count.status,
      notes: count.notes,
      items: count.items.length,
    },
  });

  return NextResponse.json(serializeInventoryCountListItem(count), { status: 201 });
}
