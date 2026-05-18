/**
 * ATENCION: script destructivo de uso manual.
 *
 * Elimina datos operativos de prueba para arrancar desde cero y conserva:
 * - AppUser
 * - migraciones / esquema
 * - configuracion de auth
 * - catalogo de productos
 * - plantillas de contrato
 *
 * Requiere confirmar explicitamente:
 * CONFIRM_CLEANUP="YES_DELETE_TEST_DATA"
 */
import "dotenv/config";

import { prisma } from "../lib/prisma";

const REQUIRED_CONFIRMATION = "YES_DELETE_TEST_DATA";
const DRY_RUN_ENABLED = process.env.CLEANUP_DRY_RUN === "true";

type CleanupSummary = {
  sales: number;
  cashMoves: number;
  dayClosures: number;
  expenses: number;
  purchaseItems: number;
  purchases: number;
  suppliers: number;
  stockMoves: number;
  memberContracts: number;
  signingSessions: number;
  accessLogs: number;
  members: number;
  productsReset: number;
};

type CleanupPlan = {
  action: string;
  target: keyof CleanupSummary;
  count: number;
};

function assertExplicitConfirmation() {
  if (process.env.CONFIRM_CLEANUP !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Abortado. Define CONFIRM_CLEANUP="${REQUIRED_CONFIRMATION}" para ejecutar este borrado.`
    );
  }
}

function printSummary(summary: CleanupSummary, plan: CleanupPlan[]) {
  console.log("");
  if (DRY_RUN_ENABLED) {
    console.log("MODO DRY-RUN: no se ha borrado ni actualizado ningun dato.");
  }
  console.log("Resumen de limpieza:");
  console.table(summary);
  console.log("Acciones:");
  for (const step of plan) {
    console.log(`- ${step.action}: ${step.target} (${step.count})`);
  }
  console.log("Conservado:");
  console.log("- AppUser");
  console.log("- Product (catalogo, con stock y averageCost reseteados a 0)");
  console.log("- ContractTemplate");
  console.log("- Migraciones Prisma");
  console.log("- Configuracion de auth");
}

async function main() {
  assertExplicitConfirmation();

  const summary = await prisma.$transaction(async (tx) => {
    if (DRY_RUN_ENABLED) {
      const [
        memberContracts,
        signingSessions,
        accessLogs,
        sales,
        cashMoves,
        dayClosures,
        expenses,
        purchaseItems,
        purchases,
        stockMoves,
        suppliers,
        members,
        productsReset,
      ] = await Promise.all([
        tx.memberContract.count(),
        tx.signingSession.count(),
        tx.accessLog.count(),
        tx.sale.count(),
        tx.cashMove.count(),
        tx.dayClosure.count(),
        tx.expense.count(),
        tx.purchaseItem.count(),
        tx.purchase.count(),
        tx.stockMove.count(),
        tx.supplier.count(),
        tx.member.count(),
        tx.product.count(),
      ]);

      return {
        sales,
        cashMoves,
        dayClosures,
        expenses,
        purchaseItems,
        purchases,
        suppliers,
        stockMoves,
        memberContracts,
        signingSessions,
        accessLogs,
        members,
        productsReset,
      } satisfies CleanupSummary;
    }

    // Orden explicito para respetar relaciones y evitar violaciones FK.
    const memberContracts = await tx.memberContract.deleteMany();
    const signingSessions = await tx.signingSession.deleteMany();
    const accessLogs = await tx.accessLog.deleteMany();

    const sales = await tx.sale.deleteMany();
    const cashMoves = await tx.cashMove.deleteMany();
    const dayClosures = await tx.dayClosure.deleteMany();
    const expenses = await tx.expense.deleteMany();

    const purchaseItems = await tx.purchaseItem.deleteMany();
    const purchases = await tx.purchase.deleteMany();
    const stockMoves = await tx.stockMove.deleteMany();

    const suppliers = await tx.supplier.deleteMany();
    const members = await tx.member.deleteMany();
    const productsReset = await tx.product.updateMany({
      data: {
        stock: 0,
        averageCost: 0,
      },
    });

    return {
      sales: sales.count,
      cashMoves: cashMoves.count,
      dayClosures: dayClosures.count,
      expenses: expenses.count,
      purchaseItems: purchaseItems.count,
      purchases: purchases.count,
      suppliers: suppliers.count,
      stockMoves: stockMoves.count,
      memberContracts: memberContracts.count,
      signingSessions: signingSessions.count,
      accessLogs: accessLogs.count,
      members: members.count,
      productsReset: productsReset.count,
    } satisfies CleanupSummary;
  });

  const plan: CleanupPlan[] = [
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "memberContracts",
      count: summary.memberContracts,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "signingSessions",
      count: summary.signingSessions,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "accessLogs",
      count: summary.accessLogs,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "sales",
      count: summary.sales,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "cashMoves",
      count: summary.cashMoves,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "dayClosures",
      count: summary.dayClosures,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "expenses",
      count: summary.expenses,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "purchaseItems",
      count: summary.purchaseItems,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "purchases",
      count: summary.purchases,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "stockMoves",
      count: summary.stockMoves,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "suppliers",
      count: summary.suppliers,
    },
    {
      action: DRY_RUN_ENABLED ? "Borraria registros de" : "Borrados registros de",
      target: "members",
      count: summary.members,
    },
    {
      action: DRY_RUN_ENABLED
        ? "Resetearia stock y averageCost de"
        : "Reseteados stock y averageCost de",
      target: "productsReset",
      count: summary.productsReset,
    },
  ];

  printSummary(summary, plan);
}

main()
  .catch((error) => {
    console.error("");
    console.error("Limpieza cancelada o fallida.");
    console.error(
      error instanceof Error ? error.message : "Error desconocido durante la limpieza."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
