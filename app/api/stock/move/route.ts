import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const stockMoveSchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().positive(),
  type: z.enum(["IN", "OUT", "ADJUST", "TRANSFER"]),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = stockMoveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { productId, qty, type } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error("Producto no encontrado");
      }

      const previousStock = Number(product.stock);
      const previousReserveStock = Number(product.reserveStock);

      let newStock = previousStock;
      let newReserveStock = previousReserveStock;

      if (type === "IN") newStock = previousStock + qty;
      if (type === "OUT") newStock = previousStock - qty;
      if (type === "ADJUST") newStock = qty;
      if (type === "TRANSFER") {
        newStock = previousStock + qty;
        newReserveStock = previousReserveStock - qty;
      }

      if (newStock < 0) {
        throw new Error("El stock no puede quedar en negativo");
      }

      if (newReserveStock < 0) {
        throw new Error("La reserva no puede quedar en negativo");
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          stock: newStock,
          reserveStock: newReserveStock,
        },
      });

      const move = await tx.stockMove.create({
        data: {
          productId,
          type,
          qty,
          previousStock,
          newStock,
          note:
            type === "TRANSFER"
              ? note
                ? `Reposicion desde reserva · ${note}`
                : "Reposicion desde reserva"
              : note,
        },
      });

      return { move, product: updatedProduct, previousReserveStock, newReserveStock };
    });

    await createAuditLog({
      actorUserId: Number(auth.session.user.id),
      actorEmail: auth.session.user.email,
      action: type === "TRANSFER" ? "STOCK_RESERVE_TRANSFER" : "STOCK_MOVE_CREATED",
      entityType: "StockMove",
      entityId: result.move.id,
      summary:
        type === "TRANSFER"
          ? `Reposicion desde reserva en producto #${productId}`
          : `Movimiento manual de stock ${result.move.type} en producto #${productId}`,
      metadata: {
        productId,
        type: result.move.type,
        qty: Number(result.move.qty),
        previousStock: Number(result.move.previousStock),
        newStock: Number(result.move.newStock),
        previousReserveStock: result.previousReserveStock,
        newReserveStock: result.newReserveStock,
        note,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error registrando movimiento" },
      { status: 400 }
    );
  }
}
