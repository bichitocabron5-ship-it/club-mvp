// app/api/products/route.ts
import { requireAdmin, requireAuth } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeUnit } from "@/lib/sales";
import { PRODUCT_CATEGORY_VALUES, PRODUCT_HASH_TYPE_VALUES } from "@/lib/types";
import { NextResponse } from "next/server";
import { z } from "zod";

const categorySchema = z.enum(PRODUCT_CATEGORY_VALUES);
const hashTypeSchema = z.enum(PRODUCT_HASH_TYPE_VALUES);

const productSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().max(500).nullable().optional(),
  unit: z.string().trim().min(1),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().min(0).optional(),
  category: categorySchema.optional(),
  hashType: hashTypeSchema.nullable().optional(),
  minStock: z.coerce.number().min(0).optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const unit = normalizeUnit(parsed.data.unit);

  if (!unit) {
    return NextResponse.json(
      { error: "La unidad debe ser G o UD" },
      { status: 400 }
    );
  }

  const category = parsed.data.category ?? "CANNABIS";

  if (category !== "HASH" && parsed.data.hashType) {
    return NextResponse.json(
      { error: "hashType solo puede usarse con categoria HASH" },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      unit,
      price: parsed.data.price,
      stock: parsed.data.stock ?? 0,
      category,
      hashType: category === "HASH" ? (parsed.data.hashType ?? null) : null,
      minStock: parsed.data.minStock ?? 5,
    },
  });

  await createAuditLog({
    actorUserId: Number(auth.session.user.id),
    actorEmail: auth.session.user.email,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    summary: `Producto creado: ${product.name}`,
    metadata: {
      unit: product.unit,
      price: Number(product.price),
      stock: Number(product.stock),
      description: product.description,
      category: product.category,
      active: product.active,
    },
  });

  return NextResponse.json(product);
}
