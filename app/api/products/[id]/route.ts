// app/api/products/[id]/route.ts
import { requireAdmin } from "@/lib/auth-server";
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
  const parsed = productPatchSchema.safeParse(body);

  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
    select: { category: true },
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

  return NextResponse.json(updated);
}
