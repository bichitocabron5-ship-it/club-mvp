import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const sales = await prisma.sale.findMany({
    where: {
      memberId,
      createdAt: {
        gte: startToday,
      },
    },
    include: {
      product: true,
    },
  });

  let grams = 0;
  let units = 0;

  for (const sale of sales) {
    if (sale.product.unit === "G") grams += sale.qty;
    if (sale.product.unit === "UD") units += sale.qty;
  }

  return NextResponse.json({
    grams,
    units,
  });
}
