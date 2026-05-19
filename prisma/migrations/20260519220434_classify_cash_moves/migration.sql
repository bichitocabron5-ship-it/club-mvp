-- AlterTable
ALTER TABLE "CashMove" ADD COLUMN     "createdByUserId" INTEGER,
ADD COLUMN     "day" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceId" TEXT;

UPDATE "CashMove"
SET
  "source" = CASE
    WHEN "type" = 'income' AND COALESCE("note", '') ILIKE '%Retirada%' THEN 'SALE'
    WHEN "type" = 'expense' AND (
      COALESCE("note", '') ILIKE 'Pago compra proveedor%'
      OR COALESCE("note", '') ILIKE 'Pago deuda proveedor%'
    ) THEN 'PURCHASE_PAYMENT'
    WHEN "type" = 'expense' THEN 'EXPENSE'
    ELSE 'MANUAL'
  END,
  "paymentMethod" = 'CASH',
  "day" = TO_CHAR(("createdAt" AT TIME ZONE 'Europe/Madrid'), 'YYYY-MM-DD');

-- AddForeignKey
ALTER TABLE "CashMove" ADD CONSTRAINT "CashMove_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
