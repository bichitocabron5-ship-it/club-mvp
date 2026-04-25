//app/api/sales/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DAILY_LIMIT_G = 10;
const DAILY_LIMIT_UD = 15;

export async function POST(req: Request) {
  const body = await req.json();
  const { memberId, productId, qty } = body;

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
  const sale = await prisma.sale.create({
    data: {
      memberId,
      productId,
      qty,
      totalAmount: total,
    },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      stock: {
        decrement: qty,
      },
    },
  });

  return NextResponse.json(sale);
}