// app/api/stock/move/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();

  const productId = Number(body.productId);
  const qty = Number(body.qty);
  const type = String(body.type || "").toUpperCase();
  const note = body.note ? String(body.note) : null;

  if (!productId || Number.isNaN(productId)) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  }

  if (!qty || Number.isNaN(qty) || qty < 0) {
    return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
  }

  if (!["IN", "OUT", "ADJUST"].includes(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error("Producto no encontrado");
    }

    const previousStock = Number(product.stock);

    let newStock = previousStock;

    if (type === "IN") newStock = previousStock + qty;
    if (type === "OUT") newStock = previousStock - qty;
    if (type === "ADJUST") newStock = qty;

    if (newStock < 0) {
      throw new Error("El stock no puede quedar en negativo");
    }

    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    const move = await tx.stockMove.create({
      data: {
        productId,
        type,
        qty,
        previousStock,
        newStock,
        note,
      },
    });

    return { product: updatedProduct, move };
  });

  await createAuditLog({
    actorUserId: Number(auth.session.user.id),
    actorEmail: auth.session.user.email,
    action: "STOCK_MOVE_CREATED",
    entityType: "StockMove",
    entityId: result.move.id,
    summary: `Movimiento manual de stock ${result.move.type} en producto #${productId}`,
    metadata: {
      productId,
      type: result.move.type,
      qty: Number(result.move.qty),
      previousStock: Number(result.move.previousStock),
      newStock: Number(result.move.newStock),
      note,
    },
  });

  return NextResponse.json(result);
}
