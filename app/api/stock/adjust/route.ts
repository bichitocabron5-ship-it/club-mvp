// app/api/stock/adjust/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const adjustSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.coerce.number().positive(),
  type: z.enum(["ADD", "REMOVE"]),
  reason: z.string().trim().min(3),
});

export async function POST(req: Request) {
  const body = await req.json();

  const parsed = adjustSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos" },
      { status: 400 }
    );
  }

  const { productId, qty, type, reason } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error("Producto no encontrado");
      }

      const previousStock = Number(product.stock);

      const newStock =
        type === "ADD"
          ? previousStock + qty
          : previousStock - qty;

      if (newStock < 0) {
        throw new Error("Stock insuficiente");
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          stock: newStock,
        },
      });

      const stockMove = await tx.stockMove.create({
        data: {
          productId,
          type: type === "ADD" ? "IN" : "OUT",
          qty,
          previousStock,
          newStock,
          note: `AJUSTE: ${reason}`,
        },
      });

      return stockMove;
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error ajustando stock",
      },
      { status: 400 }
    );
  }
}