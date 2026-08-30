import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { requireStaffOrAdmin } from "@/lib/auth-server";
import { formatLocalDay } from "@/lib/cash-move";
import { isClosureOpen } from "@/lib/day-closure";
import { prisma } from "@/lib/prisma";
import { getTodayRange, roundCurrency } from "@/lib/sales";

const cancelSaleSchema = z
  .object({
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

class SaleCancelError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SaleCancelError";
    this.status = status;
  }
}

function parseSaleId(id: string) {
  const saleId = Number(id);

  if (!Number.isInteger(saleId) || saleId <= 0) {
    throw new SaleCancelError("Retirada invalida", 400);
  }

  return saleId;
}

function sourceIdContainsSale(sourceId: string | null, saleId: number) {
  return (sourceId ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .some((value) => Number.isInteger(value) && value === saleId);
}

function getSaleMutationDay(
  sale: { createdAt: Date },
  cashMove: { day: string | null } | null
) {
  return cashMove?.day || formatLocalDay(sale.createdAt);
}

async function assertSaleDayIsOpen(
  tx: Prisma.TransactionClient,
  day: string
) {
  const closure = await tx.dayClosure.findUnique({
    where: { day },
    select: {
      status: true,
      reopenedAt: true,
    },
  });

  if (isClosureOpen(closure)) {
    throw new SaleCancelError(
      "No se puede anular una retirada de un dia cerrado."
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffOrAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const saleId = parseSaleId(id);
    const body = await req.json().catch(() => ({}));
    const parsed = cancelSaleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "El motivo es obligatorio para anular una retirada." },
        { status: 400 }
      );
    }

    const actorUserId = Number(auth.session.user.id);
    const reason = parsed.data.reason;
    const role = auth.session.user.role;

    const result = await prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: {
            member: {
              select: {
                id: true,
                fullName: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                stock: true,
                unit: true,
              },
            },
          },
        });

        if (!sale) {
          throw new SaleCancelError("Retirada no encontrada", 404);
        }

        if (sale.cancelledAt) {
          throw new SaleCancelError("La retirada ya está anulada.");
        }

        const cashMoveCandidates = await tx.cashMove.findMany({
          where: {
            source: "SALE",
            sourceId: {
              contains: String(sale.id),
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });
        const originalCashMove =
          cashMoveCandidates.find((move) =>
            sourceIdContainsSale(move.sourceId, sale.id)
          ) ?? null;
        const day = getSaleMutationDay(sale, originalCashMove);

        await assertSaleDayIsOpen(tx, day);

        const { day: today } = getTodayRange();
        const isAdmin = role === "ADMIN";
        const isOwnStaffSale =
          role === "STAFF" &&
          Number.isInteger(actorUserId) &&
          sale.appliedByUserId === actorUserId &&
          day === today;

        if (!isAdmin && !isOwnStaffSale) {
          throw new SaleCancelError("FORBIDDEN", 403);
        }

        const cancelledAt = new Date();
        const updated = await tx.sale.updateMany({
          where: {
            id: sale.id,
            cancelledAt: null,
          },
          data: {
            cancelledAt,
            cancelledByUserId: Number.isInteger(actorUserId)
              ? actorUserId
              : null,
            cancelReason: reason,
          },
        });

        if (updated.count === 0) {
          throw new SaleCancelError("La retirada ya está anulada.");
        }

        const previousStock = Number(sale.product.stock);
        const newStock = roundCurrency(previousStock + Number(sale.qty));

        await tx.product.update({
          where: {
            id: sale.productId,
          },
          data: {
            stock: {
              increment: sale.qty,
            },
          },
        });

        const stockMove = await tx.stockMove.create({
          data: {
            productId: sale.productId,
            type: "IN",
            qty: sale.qty,
            previousStock,
            newStock,
            note: `Anulacion de retirada #${sale.id}`,
          },
        });

        const compensationAmount = roundCurrency(
          Number(sale.finalAmount ?? sale.totalAmount ?? 0)
        );
        const compensationCashMove = originalCashMove
          ? await tx.cashMove.create({
              data: {
                type: "expense",
                amount: compensationAmount,
                note: `Anulacion de retirada #${sale.id}`,
                source: "SALE_CANCELLED",
                sourceId: String(sale.id),
                paymentMethod: originalCashMove.paymentMethod,
                createdByUserId: Number.isInteger(actorUserId)
                  ? actorUserId
                  : null,
                day,
              },
            })
          : null;

        await createAuditLog({
          db: tx,
          actorUserId,
          actorEmail: auth.session.user.email,
          action: "SALE_CANCELLED",
          entityType: "Sale",
          entityId: sale.id,
          summary: `Retirada anulada #${sale.id}`,
          metadata: {
            saleId: sale.id,
            memberId: sale.memberId,
            memberName: sale.member.fullName,
            productId: sale.productId,
            productName: sale.product.name,
            productUnit: sale.product.unit,
            qty: Number(sale.qty),
            amount: compensationAmount,
            cancelReason: reason,
            cancelledAt: cancelledAt.toISOString(),
            day,
            originalCashMoveId: originalCashMove?.id ?? null,
            compensationCashMoveId: compensationCashMove?.id ?? null,
            stockMoveId: stockMove.id,
          },
        });

        return tx.sale.findUnique({
          where: { id: sale.id },
          include: {
            member: {
              select: {
                id: true,
                fullName: true,
              },
            },
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SaleCancelError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("[api/sales/[id]/cancel] Failed to cancel sale", error);

    return NextResponse.json(
      { error: "Error anulando retirada" },
      { status: 500 }
    );
  }
}
