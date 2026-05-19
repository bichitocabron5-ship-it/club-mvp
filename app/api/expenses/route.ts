// app/api/expenses/route.ts
import { requireAdmin } from "@/lib/auth-server";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const expenseSchema = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  paidMethod: z.string().trim().min(1).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const expenses = await prisma.expense.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return NextResponse.json(expenses);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const parsed = expenseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        category: parsed.data.category,
        description: parsed.data.description,
        amount: parsed.data.amount,
        paidMethod: parsed.data.paidMethod || "CASH",
      },
    });

    await tx.cashMove.create({
      data: {
        type: "expense",
        amount: parsed.data.amount,
        note: `${parsed.data.category}: ${parsed.data.description}`,
      },
    });

    return created;
  });

  await createAuditLog({
    actorUserId: Number(auth.session.user.id),
    actorEmail: auth.session.user.email,
    action: "EXPENSE_CREATED",
    entityType: "Expense",
    entityId: expense.id,
    summary: `Gasto creado: ${expense.category}`,
    metadata: {
      category: expense.category,
      amount: Number(expense.amount),
      paidMethod: expense.paidMethod,
    },
  });

  return NextResponse.json(expense);
}
