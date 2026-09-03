-- AlterTable
ALTER TABLE "CashMove" ADD COLUMN     "expenseId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CashMove_expenseId_key" ON "CashMove"("expenseId");

-- AddForeignKey
ALTER TABLE "CashMove" ADD CONSTRAINT "CashMove_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
