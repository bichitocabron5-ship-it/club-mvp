// app/api/products/route.ts
import { prisma } from "@/lib/prisma";
import { normalizeUnit } from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().min(0).optional(),
  category: z.string().trim().min(1).optional(),
  minStock: z.coerce.number().min(0).optional(),
});

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
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

  const product = await prisma.product.create({
    data: {
      name: parsed.data.name,
      unit,
      price: parsed.data.price,
      stock: parsed.data.stock ?? 0,
      category: parsed.data.category || "CANNABIS",
      minStock: parsed.data.minStock ?? 5,
    },
  });

  return NextResponse.json(product);
}