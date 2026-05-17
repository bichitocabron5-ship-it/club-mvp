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

function assertExplicitConfirmation() {
  if (process.env.CONFIRM_CLEANUP !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Abortado. Define CONFIRM_CLEANUP="${REQUIRED_CONFIRMATION}" para ejecutar este borrado.`
    );
  }
}

function printSummary(summary: CleanupSummary) {
  console.log("");
  console.log("Resumen de limpieza:");
  console.table(summary);
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

  printSummary(summary);
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
