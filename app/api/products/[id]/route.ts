// app/api/products/[id]/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: body.name,
      price: body.price !== undefined ? Number(body.price) : undefined,
      category: body.category,
      minStock:
        body.minStock !== undefined ? Number(body.minStock) : undefined,
      active: body.active,
    },
  });

  return NextResponse.json(updated);
}
