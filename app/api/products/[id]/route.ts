// app/api/products/[id]/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeUnit } from "@/lib/sales";
import { PRODUCT_CATEGORY_VALUES, PRODUCT_HASH_TYPE_VALUES } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const categorySchema = z.enum(PRODUCT_CATEGORY_VALUES);
const hashTypeSchema = z.enum(PRODUCT_HASH_TYPE_VALUES);

const productPatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    unit: z.string().trim().min(1).optional(),
    price: z.coerce.number().positive().optional(),
    category: categorySchema.optional(),
    hashType: hashTypeSchema.nullable().optional(),
    minStock: z.coerce.number().min(0).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviarse al menos un campo",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await req.json();
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "stock") ||
    Object.prototype.hasOwnProperty.call(body, "reserveStock")
  ) {
    return NextResponse.json(
      { error: "Para modificar stock usa Compras o Stock" },
      { status: 400 }
    );
  }

  const parsed = productPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      description: true,
      unit: true,
      price: true,
      category: true,
      hashType: true,
      minStock: true,
      active: true,
    },
  });

  if (!existingProduct) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  let unit: "G" | "UD" | undefined;

  if (parsed.data.unit !== undefined) {
    const normalizedUnit = normalizeUnit(parsed.data.unit);

    if (!normalizedUnit) {
      return NextResponse.json(
        { error: "La unidad debe ser G o UD" },
        { status: 400 }
      );
    }

    unit = normalizedUnit;
  }

  const nextCategory = parsed.data.category ?? existingProduct.category;

  if (nextCategory !== "HASH" && parsed.data.hashType) {
    return NextResponse.json(
      { error: "hashType solo puede usarse con categoria HASH" },
      { status: 400 }
    );
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: parsed.data.name,
      description:
        parsed.data.description === undefined
          ? undefined
          : parsed.data.description?.trim() || null,
      unit,
      price: parsed.data.price,
      category: parsed.data.category,
      hashType:
        nextCategory === "HASH"
          ? parsed.data.hashType === undefined
            ? undefined
            : parsed.data.hashType
          : null,
      minStock: parsed.data.minStock,
      active: parsed.data.active,
    },
  });

  const changedFields: string[] = [];

  if (updated.name !== existingProduct.name) changedFields.push("name");
  if ((updated.description ?? null) !== (existingProduct.description ?? null)) {
    changedFields.push("description");
  }
  if (updated.unit !== existingProduct.unit) changedFields.push("unit");
  if (Number(updated.price) !== Number(existingProduct.price)) changedFields.push("price");
  if (updated.category !== existingProduct.category) changedFields.push("category");
  if ((updated.hashType ?? null) !== (existingProduct.hashType ?? null)) {
    changedFields.push("hashType");
  }
  if (Number(updated.minStock) !== Number(existingProduct.minStock)) {
    changedFields.push("minStock");
  }
  if (updated.active !== existingProduct.active) changedFields.push("active");

  if (changedFields.some((field) => field !== "active")) {
    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: updated.id,
      summary: `Producto actualizado: ${updated.name}`,
      metadata: {
        changedFields: changedFields.filter((field) => field !== "active"),
      },
    });
  }

  if (updated.active !== existingProduct.active) {
    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: updated.active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED",
      entityType: "Product",
      entityId: updated.id,
      summary: `${updated.active ? "Producto activado" : "Producto desactivado"}: ${updated.name}`,
      metadata: {
        active: updated.active,
      },
    });
  }

  return NextResponse.json(updated);
}
