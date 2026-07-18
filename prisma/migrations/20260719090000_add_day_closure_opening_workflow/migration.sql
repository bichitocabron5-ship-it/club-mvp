-- AlterTable
ALTER TABLE "DayClosure" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'CLOSED',
ADD COLUMN     "openingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "openedByUserId" INTEGER,
ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Backfill legacy closures with a best-effort closed timestamp.
UPDATE "DayClosure" SET "closedAt" = "createdAt" WHERE "closedAt" IS NULL;

-- CreateIndex
CREATE INDEX "DayClosure_status_createdAt_idx" ON "DayClosure"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
