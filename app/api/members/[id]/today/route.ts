import { requireAuth } from "@/lib/auth-server";
import { getClubSettings } from "@/lib/club-settings";
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

  const monthStart = new Date(startToday);
  monthStart.setDate(1);

  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const [settings, contract, sales, monthSales] = await Promise.all([
    getClubSettings(),
    prisma.memberContract.findFirst({
      where: { memberId },
      orderBy: { signedAt: "desc" },
      select: { consumptionGrams: true },
    }),
    prisma.sale.findMany({
      where: {
        memberId,
        createdAt: {
          gte: startToday,
        },
      },
      include: {
        product: true,
      },
    }),
    prisma.sale.findMany({
      where: {
        memberId,
        createdAt: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
      include: {
        product: true,
      },
    }),
  ]);

  let grams = 0;
  let units = 0;
  let monthlyGrams = 0;

  for (const sale of sales) {
    if (sale.product.unit === "G") grams += sale.qty;
    if (sale.product.unit === "UD") units += sale.qty;
  }

  for (const sale of monthSales) {
    if (sale.product.unit === "G") monthlyGrams += sale.qty;
  }

  return NextResponse.json({
    grams,
    units,
    monthlyGrams,
    limits: {
      dailyLimitG: settings.dailyLimitG,
      dailyLimitUd: settings.dailyLimitUd,
      monthlyLimitG: contract?.consumptionGrams ?? null,
    },
  });
}
