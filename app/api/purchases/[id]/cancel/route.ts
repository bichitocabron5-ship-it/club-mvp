import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-server";
import { isClosureOpen } from "@/lib/day-closure";
import {
  buildExpenseCancelCashNote,
  getExpenseMutationDay,
} from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { roundCurrency } from "@/lib/sales";

const cancelPurchaseSchema = z
  .object({
    reason: z.string().trim().min(5).max(2000),
  })
  .strict();

const REQUIRED_SNAPSHOT_FIELDS = [
  "stockBefore",
  "stockAfter",
  "reserveStockBefore",
  "reserveStockAfter",
  "averageCostBefore",
  "averageCostAfter",
] as const;

const FLOAT_TOLERANCE = 0.000001;
const MONEY_TOLERANCE = 0.01;

class PurchaseCancelError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "PurchaseCancelError";
    this.status = status;
  }
}

function parsePurchaseId(id: string) {
  const purchaseId = Number(id);

  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    throw new PurchaseCancelError("Compra invalida", 400);
  }

  return purchaseId;
}

function isCompatibleNumber(
  current: number,
  expected: number,
  tolerance = FLOAT_TOLERANCE
) {
  if (!Number.isFinite(current) || !Number.isFinite(expected)) return false;

  return (
    Math.abs(current - expected) <=
    Math.max(tolerance, Math.abs(expected) * FLOAT_TOLERANCE)
  );
}

function isCompatibleMoney(current: number, expected: number) {
  if (!Number.isFinite(current) || !Number.isFinite(expected)) return false;

  return Math.abs(roundCurrency(current) - roundCurrency(expected)) <= MONEY_TOLERANCE;
}

function formatDate(value: Date | null) {
  return value ? value.toISOString() : "sin fecha";
}

function normalizePaymentMethod(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "CASH";
}

function getSnapshotNumber(value: number | null) {
  if (value === null) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAllSnapshots(
  item: Record<(typeof REQUIRED_SNAPSHOT_FIELDS)[number], number | null>
) {
  return REQUIRED_SNAPSHOT_FIELDS.every(
    (field) => getSnapshotNumber(item[field]) !== null
  );
}

function assertPurchaseHasTraceableSnapshots(
  purchase: {
    id: number;
    items: Array<Record<(typeof REQUIRED_SNAPSHOT_FIELDS)[number], number | null>>;
  }
) {
  const missingItem = purchase.items.find((item) => !hasAllSnapshots(item));

  if (missingItem) {
    throw new PurchaseCancelError(
      `La compra #${purchase.id} es anterior al sistema de trazabilidad y no puede revertirse automaticamente con seguridad.`,
      409
    );
  }
}

function assertNoDuplicatedProducts(
  items: Array<{ productId: number; product: { name: string } }>
) {
  const seen = new Set<number>();

  for (const item of items) {
    if (seen.has(item.productId)) {
      throw new PurchaseCancelError(
        `La compra contiene el producto ${item.product.name} en varias lineas y no puede revertirse automaticamente con seguridad.`,
        409
      );
    }

    seen.add(item.productId);
  }
}

function isOwnPurchaseAvailableStockMove(
  move: {
    type: string;
    qty: number;
    previousStock: number;
    newStock: number;
  },
  item: {
    availableQty: number;
    stockBefore: number | null;
    stockAfter: number | null;
  }
) {
  const stockBefore = getSnapshotNumber(item.stockBefore);
  const stockAfter = getSnapshotNumber(item.stockAfter);

  return (
    move.type === "IN" &&
    isCompatibleNumber(Number(move.qty), Number(item.availableQty)) &&
    stockBefore !== null &&
    stockAfter !== null &&
    isCompatibleNumber(Number(move.previousStock), stockBefore) &&
    isCompatibleNumber(Number(move.newStock), stockAfter)
  );
}

async function assertNoUnsafeProductActivityAfterPurchase(
  tx: Prisma.TransactionClient,
  purchase: {
    id: number;
    createdAt: Date;
    items: Array<{
      productId: number;
      availableQty: number;
      stockBefore: number | null;
      stockAfter: number | null;
      product: { name: string };
    }>;
  }
) {
  for (const item of purchase.items) {
    const productName = item.product.name;

    const laterSale = await tx.sale.findFirst({
      where: {
        productId: item.productId,
        OR: [
          { createdAt: { gt: purchase.createdAt } },
          { cancelledAt: { gt: purchase.createdAt } },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        cancelledAt: true,
      },
    });

    if (laterSale) {
      const reason =
        laterSale.createdAt > purchase.createdAt
          ? `venta posterior #${laterSale.id} (${formatDate(laterSale.createdAt)})`
          : `anulacion posterior de venta #${laterSale.id} (${formatDate(
              laterSale.cancelledAt
            )})`;

      throw new PurchaseCancelError(
        `No se puede anular la compra: el producto ${productName} tiene ${reason}.`,
        409
      );
    }

    const laterPurchaseItem = await tx.purchaseItem.findFirst({
      where: {
        productId: item.productId,
        purchaseId: { not: purchase.id },
        purchase: {
          OR: [
            { createdAt: { gt: purchase.createdAt } },
            { cancelledAt: { gt: purchase.createdAt } },
          ],
        },
      },
      select: {
        purchase: {
          select: {
            id: true,
            createdAt: true,
            cancelledAt: true,
          },
        },
      },
    });

    if (laterPurchaseItem) {
      const laterPurchase = laterPurchaseItem.purchase;
      const reason =
        laterPurchase.createdAt > purchase.createdAt
          ? `otra compra posterior #${laterPurchase.id} (${formatDate(
              laterPurchase.createdAt
            )})`
          : `anulacion posterior de otra compra #${laterPurchase.id} (${formatDate(
              laterPurchase.cancelledAt
            )})`;

      throw new PurchaseCancelError(
        `No se puede anular la compra: el producto ${productName} tiene ${reason}.`,
        409
      );
    }

    const laterStockMoves = await tx.stockMove.findMany({
      where: {
        productId: item.productId,
        createdAt: { gt: purchase.createdAt },
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        type: true,
        qty: true,
        previousStock: true,
        newStock: true,
        createdAt: true,
      },
    });
    const blockingStockMove = laterStockMoves.find(
      (move) => !isOwnPurchaseAvailableStockMove(move, item)
    );

    if (blockingStockMove) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el producto ${productName} tiene un movimiento de stock posterior #${blockingStockMove.id} (${formatDate(
          blockingStockMove.createdAt
        )}).`,
        409
      );
    }

    const laterInventoryCountItem = await tx.inventoryCountItem.findFirst({
      where: {
        productId: item.productId,
        inventoryCount: {
          status: { in: ["OPEN", "CONFIRMED"] },
          OR: [
            { createdAt: { gt: purchase.createdAt } },
            { confirmedAt: { gt: purchase.createdAt } },
          ],
        },
      },
      select: {
        inventoryCount: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            confirmedAt: true,
          },
        },
      },
    });

    if (laterInventoryCountItem) {
      const count = laterInventoryCountItem.inventoryCount;
      const reason =
        count.confirmedAt && count.confirmedAt > purchase.createdAt
          ? `conteo confirmado #${count.id} (${formatDate(count.confirmedAt)})`
          : `conteo abierto posterior #${count.id} (${formatDate(count.createdAt)})`;

      throw new PurchaseCancelError(
        `No se puede anular la compra: el producto ${productName} tiene ${reason}.`,
        409
      );
    }
  }
}

function assertCurrentProductStateMatchesSnapshots(
  items: Array<{
    stockAfter: number | null;
    reserveStockAfter: number | null;
    averageCostAfter: number | null;
    product: {
      name: string;
      stock: number;
      reserveStock: number;
      averageCost: number;
    };
  }>
) {
  for (const item of items) {
    const stockAfter = getSnapshotNumber(item.stockAfter);
    const reserveStockAfter = getSnapshotNumber(item.reserveStockAfter);
    const averageCostAfter = getSnapshotNumber(item.averageCostAfter);

    if (
      stockAfter === null ||
      reserveStockAfter === null ||
      averageCostAfter === null
    ) {
      throw new PurchaseCancelError(
        "La compra no tiene snapshots completos para validar el estado actual.",
        409
      );
    }

    if (!isCompatibleNumber(Number(item.product.stock), stockAfter)) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el stock disponible actual de ${item.product.name} no coincide con el snapshot posterior de la compra.`,
        409
      );
    }

    if (
      !isCompatibleNumber(Number(item.product.reserveStock), reserveStockAfter)
    ) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: la reserva actual de ${item.product.name} no coincide con el snapshot posterior de la compra.`,
        409
      );
    }

    if (
      !isCompatibleNumber(Number(item.product.averageCost), averageCostAfter)
    ) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el coste medio actual de ${item.product.name} no coincide con el snapshot posterior de la compra.`,
        409
      );
    }
  }
}

function sumAmounts(items: Array<{ amount: number }>) {
  return roundCurrency(
    items.reduce((total, item) => total + Number(item.amount), 0)
  );
}

async function assertPaymentDayCanBeCompensated(
  tx: Prisma.TransactionClient,
  day: string,
  expenseId: number
) {
  const closure = await tx.dayClosure.findUnique({
    where: { day },
    select: {
      status: true,
      reopenedAt: true,
    },
  });

  if (isClosureOpen(closure)) {
    throw new PurchaseCancelError(
      `No se puede anular la compra porque el pago de gasto #${expenseId} pertenece al dia de caja cerrado ${day}.`,
      409
    );
  }
}

async function validateStructuredPayments(
  tx: Prisma.TransactionClient,
  purchase: { id: number; paidAmount: number }
) {
  const purchaseSourceId = String(purchase.id);
  const [paymentExpenses, originalCashMoves] = await Promise.all([
    tx.expense.findMany({
      where: {
        source: "PURCHASE_PAYMENT",
        sourceId: purchaseSourceId,
      },
      include: {
        cashMove: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.cashMove.findMany({
      where: {
        source: "PURCHASE_PAYMENT",
        sourceId: purchaseSourceId,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  const paidAmount = roundCurrency(Number(purchase.paidAmount));
  const expenseTotal = sumAmounts(paymentExpenses);
  const cashMoveTotal = sumAmounts(originalCashMoves);

  if (paymentExpenses.some((expense) => expense.cancelledAt !== null)) {
    throw new PurchaseCancelError(
      "No se puede anular la compra: ya hay pagos de proveedor anulados previamente.",
      409
    );
  }

  if (!isCompatibleMoney(expenseTotal, paidAmount)) {
    throw new PurchaseCancelError(
      "No se puede anular la compra: la suma de gastos estructurados no coincide con el importe pagado.",
      409
    );
  }

  if (!isCompatibleMoney(cashMoveTotal, paidAmount)) {
    throw new PurchaseCancelError(
      "No se puede anular la compra: la suma de movimientos de caja estructurados no coincide con el importe pagado.",
      409
    );
  }

  if (paymentExpenses.length !== originalCashMoves.length) {
    throw new PurchaseCancelError(
      "No se puede anular la compra: los gastos y movimientos de caja de sus pagos no cuadran.",
      409
    );
  }

  const paymentExpenseIds = new Set(
    paymentExpenses.map((expense) => expense.id)
  );

  for (const cashMove of originalCashMoves) {
    if (cashMove.expenseId === null) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el movimiento de caja #${cashMove.id} no esta enlazado a su gasto de origen.`,
        409
      );
    }

    if (!paymentExpenseIds.has(cashMove.expenseId)) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el movimiento de caja #${cashMove.id} esta enlazado a un gasto que no pertenece a esta compra.`,
        409
      );
    }
  }

  const structuredPayments = paymentExpenses.map((expense) => {
    const cashMove = expense.cashMove;

    if (!cashMove) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el gasto #${expense.id} no tiene movimiento de caja enlazado.`,
        409
      );
    }

    if (cashMove.source !== "PURCHASE_PAYMENT" || cashMove.sourceId !== purchaseSourceId) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el movimiento de caja #${cashMove.id} del gasto #${expense.id} no pertenece a esta compra.`,
        409
      );
    }

    if (cashMove.expenseId !== expense.id) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el movimiento de caja #${cashMove.id} no apunta al gasto #${expense.id}.`,
        409
      );
    }

    if (cashMove.type !== "expense") {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el movimiento de caja #${cashMove.id} no es un gasto.`,
        409
      );
    }

    if (!isCompatibleMoney(Number(expense.amount), Number(cashMove.amount))) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el gasto #${expense.id} y su movimiento de caja #${cashMove.id} no tienen el mismo importe.`,
        409
      );
    }

    if (
      normalizePaymentMethod(expense.paidMethod) !==
      normalizePaymentMethod(cashMove.paymentMethod)
    ) {
      throw new PurchaseCancelError(
        `No se puede anular la compra: el metodo de pago del gasto #${expense.id} no coincide con caja.`,
        409
      );
    }

    return {
      expense,
      originalCashMove: cashMove,
    };
  });

  if (paymentExpenses.length > 0) {
    const existingCompensations = await tx.cashMove.findMany({
      where: {
        source: "EXPENSE_CANCELLED",
        sourceId: {
          in: paymentExpenses.map((expense) => String(expense.id)),
        },
      },
      select: {
        id: true,
        sourceId: true,
      },
    });

    if (existingCompensations.length > 0) {
      throw new PurchaseCancelError(
        "No se puede anular la compra: ya existen compensaciones de caja para alguno de sus pagos.",
        409
      );
    }
  }

  for (const { expense, originalCashMove } of structuredPayments) {
    const day = getExpenseMutationDay(expense, originalCashMove);
    await assertPaymentDayCanBeCompensated(tx, day, expense.id);
  }

  return {
    paymentExpenses: structuredPayments.map((payment) => payment.expense),
    originalCashMoves,
    structuredPayments,
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const purchaseId = parsePurchaseId(id);
    const body = await req.json().catch(() => ({}));
    const parsed = cancelPurchaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "El motivo es obligatorio y debe tener al menos 5 caracteres." },
        { status: 400 }
      );
    }

    const actorUserId = Number(auth.session.user.id);
    const cancelledByUserId = Number.isInteger(actorUserId)
      ? actorUserId
      : null;
    const reason = parsed.data.reason;

    const result = await prisma.$transaction(
      async (tx) => {
        const purchase = await tx.purchase.findUnique({
          where: { id: purchaseId },
          include: {
            supplier: true,
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    stock: true,
                    reserveStock: true,
                    averageCost: true,
                  },
                },
              },
            },
          },
        });

        if (!purchase) {
          throw new PurchaseCancelError("Compra no encontrada", 404);
        }

        if (purchase.cancelledAt || purchase.status === "CANCELLED") {
          throw new PurchaseCancelError("La compra ya esta anulada.", 409);
        }

        assertPurchaseHasTraceableSnapshots(purchase);
        assertNoDuplicatedProducts(purchase.items);
        await assertNoUnsafeProductActivityAfterPurchase(tx, purchase);
        assertCurrentProductStateMatchesSnapshots(purchase.items);

        const { paymentExpenses, originalCashMoves, structuredPayments } =
          await validateStructuredPayments(tx, purchase);

        const cancelledAt = new Date();
        const updatedPurchase = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            cancelledAt: null,
          },
          data: {
            cancelledAt,
            cancelledByUserId,
            cancelReason: reason,
            status: "CANCELLED",
          },
        });

        if (updatedPurchase.count === 0) {
          throw new PurchaseCancelError("La compra ya esta anulada.", 409);
        }

        const stockMoveIds: number[] = [];
        const itemAuditMetadata: Prisma.InputJsonValue[] = [];

        for (const item of purchase.items) {
          const stockBefore = getSnapshotNumber(item.stockBefore);
          const reserveStockBefore = getSnapshotNumber(item.reserveStockBefore);
          const averageCostBefore = getSnapshotNumber(item.averageCostBefore);

          if (
            stockBefore === null ||
            reserveStockBefore === null ||
            averageCostBefore === null
          ) {
            throw new PurchaseCancelError(
              "La compra no tiene snapshots completos para restaurar stock.",
              409
            );
          }

          const stockBeforeCancel = Number(item.product.stock);
          const reserveBeforeCancel = Number(item.product.reserveStock);
          const averageCostBeforeCancel = Number(item.product.averageCost);

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: stockBefore,
              reserveStock: reserveStockBefore,
              averageCost: averageCostBefore,
            },
          });

          const availableDelta = stockBeforeCancel - stockBefore;

          if (!isCompatibleNumber(availableDelta, 0)) {
            const stockMove = await tx.stockMove.create({
              data: {
                productId: item.productId,
                type: availableDelta > 0 ? "OUT" : "IN",
                qty: Math.abs(availableDelta),
                previousStock: stockBeforeCancel,
                newStock: stockBefore,
                note: `PURCHASE_CANCELLED compra #${purchase.id}`,
              },
            });

            stockMoveIds.push(stockMove.id);
          }

          itemAuditMetadata.push({
            productId: item.productId,
            productName: item.product.name,
            qty: Number(item.qty),
            availableQty: Number(item.availableQty),
            reserveQty: Number(item.reserveQty),
            stockBeforeCancel,
            stockAfterCancel: stockBefore,
            reserveBeforeCancel,
            reserveAfterCancel: reserveStockBefore,
            averageCostBeforeCancel,
            averageCostAfterCancel: averageCostBefore,
          });
        }

        const compensationCashMoveIds: number[] = [];

        for (const { expense, originalCashMove } of structuredPayments) {
          const updatedExpense = await tx.expense.update({
            where: { id: expense.id },
            data: {
              cancelledAt,
              cancelledByUserId,
              cancelReason: reason,
            },
          });
          const day = getExpenseMutationDay(expense, originalCashMove);
          const compensationCashMove = await tx.cashMove.create({
            data: {
              type: "income",
              amount: originalCashMove.amount,
              note: buildExpenseCancelCashNote(updatedExpense),
              source: "EXPENSE_CANCELLED",
              sourceId: String(expense.id),
              paymentMethod: originalCashMove.paymentMethod,
              createdByUserId: cancelledByUserId,
              day,
            },
          });

          compensationCashMoveIds.push(compensationCashMove.id);
        }

        await tx.auditLog.create({
          data: {
            actorUserId: cancelledByUserId,
            actorEmail: auth.session.user.email?.trim().toLowerCase() || null,
            action: "PURCHASE_CANCELLED",
            entityType: "Purchase",
            entityId: String(purchase.id),
            summary: `Compra anulada #${purchase.id}`,
            metadata: {
              purchaseId: purchase.id,
              supplierId: purchase.supplierId,
              supplierName: purchase.supplier.name,
              reason,
              cancelledByUserId,
              actorEmail: auth.session.user.email ?? null,
              cancelledAt: cancelledAt.toISOString(),
              items: itemAuditMetadata,
              originalExpenseIds: paymentExpenses.map((expense) => expense.id),
              originalCashMoveIds: originalCashMoves.map((move) => move.id),
              compensationCashMoveIds,
              stockMoveIds,
              paidAmount: Number(purchase.paidAmount),
              totalAmount: Number(purchase.totalAmount),
              strategy:
                "SNAPSHOT_RESTORE_WITH_STRUCTURED_PAYMENT_COMPENSATION",
              stockStrategy:
                "Product stock/reserveStock/averageCost restored from PurchaseItem snapshots",
              paymentStrategy:
                "Original PURCHASE_PAYMENT expenses marked cancelled; EXPENSE_CANCELLED income cash moves created",
            } as Prisma.InputJsonValue,
          },
        });

        return tx.purchase.findUnique({
          where: { id: purchase.id },
          include: {
            supplier: true,
            items: {
              include: {
                product: true,
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
    if (error instanceof PurchaseCancelError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo anular la compra por concurrencia. Vuelve a intentarlo.",
        },
        { status: 409 }
      );
    }

    console.error("[api/purchases/[id]/cancel] Failed to cancel purchase", error);

    return NextResponse.json(
      { error: "Error anulando compra" },
      { status: 500 }
    );
  }
}
