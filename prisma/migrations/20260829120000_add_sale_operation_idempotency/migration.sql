-- CreateEnum
CREATE TYPE "SaleOperationType" AS ENUM ('SINGLE', 'BULK');

-- CreateTable
CREATE TABLE "SaleOperation" (
    "id" SERIAL NOT NULL,
    "operatorUserId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationType" "SaleOperationType" NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "memberId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleOperation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "saleOperationId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SaleOperation_operatorUserId_idempotencyKey_key" ON "SaleOperation"("operatorUserId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SaleOperation_memberId_createdAt_idx" ON "SaleOperation"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleOperation_operatorUserId_createdAt_idx" ON "SaleOperation"("operatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_saleOperationId_idx" ON "Sale"("saleOperationId");

-- AddForeignKey
ALTER TABLE "SaleOperation" ADD CONSTRAINT "SaleOperation_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleOperation" ADD CONSTRAINT "SaleOperation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_saleOperationId_fkey" FOREIGN KEY ("saleOperationId") REFERENCES "SaleOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
