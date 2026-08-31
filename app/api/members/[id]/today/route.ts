import { requireAuth } from "@/lib/auth-server";
import { getClubSettings } from "@/lib/club-settings";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const MEMBER_ID_PATTERN = /^[1-9]\d*$/;
const POSTGRES_INT_MAX = 2147483647;

function parseMemberId(value: string) {
  if (!MEMBER_ID_PATTERN.test(value)) {
    return null;
  }

  const memberId = Number(value);

  if (!Number.isSafeInteger(memberId) || memberId > POSTGRES_INT_MAX) {
    return null;
  }

  return memberId;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const memberId = parseMemberId(id);

  if (memberId === null) {
    return NextResponse.json(
      { error: "ID de socio invalido" },
      { status: 400 }
    );
  }

  try {
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
          cancelledAt: null,
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
          cancelledAt: null,
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
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
