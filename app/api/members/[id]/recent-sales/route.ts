import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = Number(id);

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return NextResponse.json(
      { error: "ID de socio invalido" },
      { status: 400 }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404 }
    );
  }

  const sales = await prisma.sale.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      qty: true,
      totalAmount: true,
      finalAmount: true,
      createdAt: true,
      cancelledAt: true,
      product: {
        select: {
          name: true,
          unit: true,
        },
      },
    },
  });

  return NextResponse.json({
    sales: sales.map((sale) => ({
      id: sale.id,
      qty: Number(sale.qty),
      finalAmount: Number(sale.finalAmount ?? sale.totalAmount ?? 0),
      createdAt: sale.createdAt.toISOString(),
      cancelledAt: sale.cancelledAt?.toISOString() ?? null,
      product: sale.product,
    })),
  });
}
