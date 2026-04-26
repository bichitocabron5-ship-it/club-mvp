// app/api/sales/bulk/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

const bulkSaleSchema = z.object({
  memberId: z.number().int().positive(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      qty: z.number().positive(),
    })
  ).min(1),
});

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const day = start.toISOString().slice(0, 10);

  return { start, end, day };
}

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = bulkSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos" },
      { status: 400 }
    );
  }

  const { memberId, items } = parsed.data;
  const { start, day } = getTodayRange();

  const todayClosed = await prisma.dayClosure.findUnique({
    where: { day },
  });

  if (todayClosed) {
    return NextResponse.json(
      { error: "El día está cerrado. No se pueden registrar más retiradas." },
      { status: 400 }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404 }
    );
  }

  const productIds = items.map((i) => i.productId);

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { error: "Algún producto no existe" },
      { status: 400 }
    );
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Agrupar por producto por si se añade el mismo varias veces
  const grouped = new Map<number, number>();

  for (const item of items) {
    grouped.set(
      item.productId,
      (grouped.get(item.productId) || 0) + item.qty
    );
  }

  let cartG = 0;
  let cartUD = 0;
  let totalAmount = 0;

  for (const [productId, qty] of grouped.entries()) {
    const product = productMap.get(productId);

    if (!product) {
      return NextResponse.json(
        { error: "Producto inválido" },
        { status: 400 }
      );
    }

    if (product.unit === "UD" && !Number.isInteger(qty)) {
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

    if (product.unit === "G") cartG += qty;
    if (product.unit === "UD") cartUD += qty;

    totalAmount += qty * Number(product.price);
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

  let todayG = 0;
  let todayUD = 0;

  for (const sale of salesToday) {
    if (sale.product.unit === "G") todayG += sale.qty;
    if (sale.product.unit === "UD") todayUD += sale.qty;
  }

  if (todayG + cartG > DAILY_LIMIT_G) {
    return NextResponse.json(
      { error: `Límite diario de gramos superado (${DAILY_LIMIT_G} g)` },
      { status: 400 }
    );
  }

  if (todayUD + cartUD > DAILY_LIMIT_UD) {
    return NextResponse.json(
      { error: `Límite diario de unidades superado (${DAILY_LIMIT_UD} ud)` },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdSales = [];

      for (const [productId, qty] of grouped.entries()) {
        const product = productMap.get(productId)!;
        const lineTotal = qty * Number(product.price);

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
            totalAmount: lineTotal,
            note: "Retirada en carrito",
          },
        });

        createdSales.push(sale);
      }

      await tx.cashMove.create({
        data: {
          type: "income",
          amount: totalAmount,
          note: `Retirada múltiple - ${member.fullName}`,
        },
      });

      return {
        sales: createdSales,
        totalAmount,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error al registrar retirada" },
      { status: 400 }
    );
  }
}