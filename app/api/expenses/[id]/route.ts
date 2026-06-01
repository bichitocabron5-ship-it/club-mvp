import { createAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-server";
import { normalizeCashMovePaymentMethod } from "@/lib/cash-move";
import {
  assertExpenseDayIsOpen,
  assertExpenseIsEditable,
  assertExpenseIsNotPurchaseManaged,
  buildExpenseCashNote,
  ExpenseMutationError,
  getExpenseMutationDay,
} from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchExpenseSchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    paidMethod: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Sin cambios",
  });

function parseExpenseId(id: string) {
  const expenseId = Number(id);

  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    throw new ExpenseMutationError("Gasto inválido", 400);
  }

  return expenseId;
}

export async function PATCH(
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
    const parsed = patchExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const actorUserId = Number(auth.session.user.id);
    const updatedExpense = await prisma.$transaction(async (tx) => {
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

      const data = {
        ...(parsed.data.category !== undefined
          ? { category: parsed.data.category }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.amount !== undefined
          ? { amount: parsed.data.amount }
          : {}),
        ...(parsed.data.paidMethod !== undefined
          ? {
              paidMethod: normalizeCashMovePaymentMethod(
                parsed.data.paidMethod
              ),
            }
          : {}),
      };

      const updated = await tx.expense.update({
        where: { id: expense.id },
        data,
      });

      if (cashMove) {
        await tx.cashMove.update({
          where: {
            id: cashMove.id,
          },
          data: {
            amount: updated.amount,
            note: buildExpenseCashNote(updated),
            paymentMethod: updated.paidMethod,
          },
        });
      }

      await createAuditLog({
        db: tx,
        actorUserId,
        actorEmail: auth.session.user.email,
        action: "EXPENSE_UPDATED",
        entityType: "Expense",
        entityId: updated.id,
        summary: `Gasto actualizado: ${updated.category}`,
        metadata: {
          previous: {
            category: expense.category,
            description: expense.description,
            amount: Number(expense.amount),
            paidMethod: expense.paidMethod,
          },
          next: {
            category: updated.category,
            description: updated.description,
            amount: Number(updated.amount),
            paidMethod: updated.paidMethod,
          },
          day,
          cashMoveId: cashMove?.id ?? null,
          cashMoveWarning: cashMove
            ? null
            : "NO_EXPENSE_CASH_MOVE_FOUND",
        },
      });

      return updated;
    });

    return NextResponse.json(updatedExpense);
  } catch (error) {
    if (error instanceof ExpenseMutationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("[api/expenses/[id]] Failed to update expense", error);

    return NextResponse.json(
      { error: "Error actualizando gasto" },
      { status: 500 }
    );
  }
}
