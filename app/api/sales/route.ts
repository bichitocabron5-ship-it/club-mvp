//app/api/sales/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

const saleSchema = z.object({
  memberId: z.number().int().positive(),
  productId: z.number().int().positive(),
  qty: z.number().positive(),
});

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = saleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos" },
      { status: 400 }
    );
  }

  const { memberId, productId, qty } = parsed.data;

  if (!memberId || !productId || !qty || qty <= 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // 1. Buscar producto
  const product = await prisma.product.findUnique({
    where: { id: memberId ? productId : 0 },
  });

  if (!product) {
    return NextResponse.json({ error: "Producto no existe" }, { status: 404 });
  }

  // 2. Calcular total REAL
  const total = qty * product.price;

  // 3. Calcular consumo de hoy
  const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const todayKey = startToday.toISOString().slice(0, 10);

    const todayClosed = await prisma.dayClosure.findUnique({
      where: { day: todayKey },
    });

    if (todayClosed) {
      return NextResponse.json(
        { error: "El día está cerrado. No se pueden registrar más retiradas." },
        { status: 400 }
      );
    }

  const salesToday = await prisma.sale.findMany({
    where: {
      memberId,
      createdAt: { gte: startToday },
    },
    include: { product: true },
  });

  let totalG = 0;
  let totalUD = 0;

  for (const s of salesToday) {
    if (s.product.unit === "g") totalG += s.qty;
    if (s.product.unit === "ud") totalUD += s.qty;
  }

  // 4. Validar límites
  if (product.unit === "g" && totalG + qty > DAILY_LIMIT_G) {
    return NextResponse.json({ error: "Límite diario gramos" }, { status: 400 });
  }

  if (product.unit === "ud" && totalUD + qty > DAILY_LIMIT_UD) {
    return NextResponse.json({ error: "Límite diario unidades" }, { status: 400 });
  }

  // 5. Validar stock
  if (product.stock < qty) {
    return NextResponse.json({ error: "Sin stock" }, { status: 400 });
  }

  // 6. Crear venta + actualizar stock
  try {
  const result = await prisma.$transaction(async (tx) => {
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
          gte: qty, // 🔥 evita stock negativo por concurrencia
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

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error en la venta" },
      { status: 400 }
    );
  }
}
