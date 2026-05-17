// app/api/sales/route.ts
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  DAILY_LIMIT_G,
  DAILY_LIMIT_UD,
  getDailyTotals,
  getErrorMessage,
  getSaleMemberStatus,
  getTodayRange,
  normalizeUnit,
} from "@/lib/sales";
import { NextResponse } from "next/server";
import { z } from "zod";

const saleSchema = z.object({
  memberId: z.number().int().positive(),
  productId: z.number().int().positive(),
  qty: z.number().positive(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = saleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { memberId, productId, qty } = parsed.data;
  const memberStatus = await getSaleMemberStatus(memberId);

  if ("error" in memberStatus) {
    return NextResponse.json(
      { error: memberStatus.error },
      { status: memberStatus.status }
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
  }

  const productUnit = normalizeUnit(product.unit);

  if (!productUnit) {
    return NextResponse.json(
      { error: "Unidad de producto invalida" },
      { status: 400 }
    );
  }

  if (productUnit === "UD" && !Number.isInteger(qty)) {
    return NextResponse.json(
      { error: `El producto ${product.name} requiere unidades enteras` },
      { status: 400 }
    );
  }

  const total = qty * product.price;
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

  const salesToday = await prisma.sale.findMany({
    where: {
      memberId,
      createdAt: { gte: start },
    },
    include: { product: true },
  });

  const { grams, units } = getDailyTotals(salesToday);

  if (productUnit === "G" && grams + qty > DAILY_LIMIT_G) {
    return NextResponse.json({ error: "Limite diario gramos" }, { status: 400 });
  }

  if (productUnit === "UD" && units + qty > DAILY_LIMIT_UD) {
    return NextResponse.json(
      { error: "Limite diario unidades" },
      { status: 400 }
    );
  }

  if (product.stock < qty) {
    return NextResponse.json({ error: "Sin stock" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const sale = await tx.sale.create({
        data: {
          memberId,
          productId,
          qty,
          totalAmount: total,
        },
      });

      const productUpdated = await tx.product.updateMany({
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

      if (productUpdated.count === 0) {
        throw new Error("Stock insuficiente (concurrencia)");
      }

      await tx.cashMove.create({
        data: {
          type: "income",
          amount: total,
          note: `Retirada producto ${product.name}`,
        },
      });

      return sale;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Error en la venta") },
      { status: 400 }
    );
  }
}
