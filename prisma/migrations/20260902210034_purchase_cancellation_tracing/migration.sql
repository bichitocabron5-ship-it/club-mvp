-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "averageCostAfter" DOUBLE PRECISION,
ADD COLUMN     "averageCostBefore" DOUBLE PRECISION,
ADD COLUMN     "reserveStockAfter" DOUBLE PRECISION,
ADD COLUMN     "reserveStockBefore" DOUBLE PRECISION,
ADD COLUMN     "stockAfter" DOUBLE PRECISION,
ADD COLUMN     "stockBefore" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "CashMove_source_sourceId_idx" ON "CashMove"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Expense_source_sourceId_idx" ON "Expense"("source", "sourceId");

-- CreateIndex
CREATE INDEX "Purchase_cancelledAt_idx" ON "Purchase"("cancelledAt");

-- CreateIndex
CREATE INDEX "Purchase_status_createdAt_idx" ON "Purchase"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
