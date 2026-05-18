import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  DAILY_LIMIT_G,
  DAILY_LIMIT_UD,
  getDailyTotals,
  getErrorMessage,
  getMemberSalePricing,
  getSaleMemberStatus,
  getTodayRange,
  normalizeDiscountPercent,
  normalizeUnit,
} from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const bulkSaleSchema = z.object({
  memberId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().positive(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = bulkSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { memberId, items } = parsed.data;
  const { start, day } = getTodayRange();

  const todayClosed = await prisma.dayClosure.findUnique({
    where: { day },
  });

  if (todayClosed) {
    return NextResponse.json(
      { error: "El dia esta cerrado. No se pueden registrar mas retiradas." },
      { status: 400 }
    );
  }

  const memberStatus = await getSaleMemberStatus(memberId);

  if ("error" in memberStatus) {
    return NextResponse.json(
      { error: memberStatus.error },
      { status: memberStatus.status }
    );
  }

  const { member } = memberStatus;
  const appliedByUserId = Number(auth.session.user.id);

  if (Number.isNaN(appliedByUserId)) {
    return NextResponse.json({ error: "Usuario invalido" }, { status: 400 });
  }

  try {
    normalizeDiscountPercent(Number(member.discountPercent || 0));
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Descuento de socio invalido") },
      { status: 400 }
    );
  }

  const productIds = items.map((item) => item.productId);

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { error: "Algun producto no existe" },
      { status: 400 }
    );
  }

  type ProductRecord = (typeof products)[number];

  const productMap = new Map<number, ProductRecord>(
    products.map((product) => [product.id, product])
  );
  const grouped = new Map<number, number>();

  for (const item of items) {
    grouped.set(item.productId, (grouped.get(item.productId) || 0) + item.qty);
  }

  let cartG = 0;
  let cartUD = 0;
  let totalOriginalAmount = 0;
  let totalFinalAmount = 0;

  for (const [productId, qty] of grouped.entries()) {
    const product = productMap.get(productId);

    if (!product) {
      return NextResponse.json({ error: "Producto invalido" }, { status: 400 });
    }

    const unit = normalizeUnit(product.unit);

    if (!unit) {
      return NextResponse.json(
        { error: `Unidad invalida: ${product.name}` },
        { status: 400 }
      );
    }

    if (unit === "UD" && !Number.isInteger(qty)) {
      return NextResponse.json(
        { error: `El producto ${product.name} requiere unidades enteras` },
        { status: 400 }
      );
    }

    if (Number(product.stock) < qty) {
      return NextResponse.json(
        { error: `Stock insuficiente: ${product.name}` },
        { status: 400 }
      );
    }

    if (unit === "G") cartG += qty;
    if (unit === "UD") cartUD += qty;

    const pricing = getMemberSalePricing(qty, Number(product.price), member);
    totalOriginalAmount += pricing.originalAmount;
    totalFinalAmount += pricing.finalAmount;
  }

  const salesToday = await prisma.sale.findMany({
    where: {
      memberId,
      createdAt: { gte: start },
    },
    include: {
      product: true,
    },
  });

  const { grams: todayG, units: todayUD } = getDailyTotals(salesToday);

  if (todayG + cartG > DAILY_LIMIT_G) {
    return NextResponse.json(
      { error: `Limite diario de gramos superado (${DAILY_LIMIT_G} g)` },
      { status: 400 }
    );
  }

  if (todayUD + cartUD > DAILY_LIMIT_UD) {
    return NextResponse.json(
      { error: `Limite diario de unidades superado (${DAILY_LIMIT_UD} ud)` },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdSales = [];

      for (const [productId, qty] of grouped.entries()) {
        const product = productMap.get(productId)!;
        const pricing = getMemberSalePricing(qty, Number(product.price), member);

        const unitCost = Number(product.averageCost || 0);
        const profit = pricing.finalAmount - qty * unitCost;

        const previousStock = Number(product.stock);
        const newStock = previousStock - qty;

        const updated = await tx.product.updateMany({
          where: {
            id: productId,
            stock: {
              gte: qty,
            },
          },
          data: {
            stock: {
              decrement: qty,
            },
          },
        });

        if (updated.count === 0) {
          throw new Error(`Stock insuficiente: ${product.name}`);
        }

        const sale = await tx.sale.create({
          data: {
            memberId,
            productId,
            qty,
            totalAmount: pricing.finalAmount,
            unitCost,
            profit,
            note: "Retirada en carrito",
            originalAmount: pricing.originalAmount,
            discountPercent: pricing.discountPercent,
            discountAmount: pricing.discountAmount,
            finalAmount: pricing.finalAmount,
            discountReason: pricing.discountReason,
            discountSource: pricing.discountSource,
            appliedByUserId,
          },
        });
      
       await tx.stockMove.create({
        data: {
          productId,
          type: "OUT",
          qty,
          previousStock,
          newStock,
          note: `Retirada en carrito`,
        },
      });

        createdSales.push(sale);
      }

      await tx.cashMove.create({
        data: {
          type: "income",
          amount: totalFinalAmount,
          note: `Retirada multiple - ${member.fullName}`,
        },
      });

      return {
        sales: createdSales,
        totalAmount: totalFinalAmount,
        originalAmount: totalOriginalAmount,
      };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Error al registrar retirada") },
      { status: 400 }
    );
  }
}
