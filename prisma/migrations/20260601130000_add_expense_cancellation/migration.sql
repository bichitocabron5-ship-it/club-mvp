-- AlterTable
ALTER TABLE "Expense"
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" INTEGER,
ADD COLUMN     "cancelReason" TEXT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
