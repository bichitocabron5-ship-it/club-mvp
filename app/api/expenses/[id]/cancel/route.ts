import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import {
  assertExpenseDayIsOpen,
  assertExpenseIsEditable,
  assertExpenseIsNotPurchaseManaged,
  buildExpenseCancelCashNote,
  ExpenseMutationError,
  getExpenseMutationDay,
} from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const cancelExpenseSchema = z
  .object({
    reason: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

function parseExpenseId(id: string) {
  const expenseId = Number(id);

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    throw new ExpenseMutationError("Gasto inválido", 400);
  }

  return expenseId;
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
    const expenseId = parseExpenseId(id);
    const body = await req.json().catch(() => ({}));
    const parsed = cancelExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const actorUserId = Number(auth.session.user.id);
    const reason = parsed.data.reason?.trim() || null;

    const cancelledExpense = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
      });

      if (!expense) {
        throw new ExpenseMutationError("Gasto no encontrado", 404);
      }

      assertExpenseIsEditable(expense);
      assertExpenseIsNotPurchaseManaged(expense);

      const cashMove = await tx.cashMove.findFirst({
        where: {
          source: "EXPENSE",
          sourceId: String(expense.id),
        },
        orderBy: {
          createdAt: "asc",
        },
      });
      const day = getExpenseMutationDay(expense, cashMove);

      await assertExpenseDayIsOpen(tx, day);

      const cancelledAt = new Date();
      const updated = await tx.expense.update({
        where: {
          id: expense.id,
        },
        data: {
          cancelledAt,
          cancelledByUserId: Number.isInteger(actorUserId)
            ? actorUserId
            : null,
          cancelReason: reason,
        },
      });

      const compensationCashMove = cashMove
        ? await tx.cashMove.create({
            data: {
              type: "income",
              amount: cashMove.amount,
              note: buildExpenseCancelCashNote(updated),
              source: "EXPENSE_CANCELLED",
              sourceId: String(expense.id),
              paymentMethod: cashMove.paymentMethod,
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
        action: "EXPENSE_CANCELLED",
        entityType: "Expense",
        entityId: updated.id,
        summary: `Gasto anulado: ${updated.category}`,
        metadata: {
          category: updated.category,
          description: updated.description,
          amount: Number(updated.amount),
          paidMethod: updated.paidMethod,
          cancelledAt: cancelledAt.toISOString(),
          cancelReason: reason,
          day,
          originalCashMoveId: cashMove?.id ?? null,
          compensationCashMoveId: compensationCashMove?.id ?? null,
          compensationAmount: compensationCashMove
            ? Number(compensationCashMove.amount)
            : null,
          cashMoveWarning: cashMove
            ? null
            : "NO_EXPENSE_CASH_MOVE_FOUND",
        },
      });

      return updated;
    });

    return NextResponse.json(cancelledExpense);
  } catch (error) {
    if (error instanceof ExpenseMutationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("[api/expenses/[id]/cancel] Failed to cancel expense", error);

    return NextResponse.json(
      { error: "Error anulando gasto" },
      { status: 500 }
    );
  }
}
