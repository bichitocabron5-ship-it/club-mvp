-- AlterTable
ALTER TABLE "DayClosure" ADD COLUMN     "closedByUserId" INTEGER,
ADD COLUMN     "discountsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "expensesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "inventoryCountId" INTEGER,
ADD COLUMN     "manualCashTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedByUserId" INTEGER,
ADD COLUMN     "salesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
