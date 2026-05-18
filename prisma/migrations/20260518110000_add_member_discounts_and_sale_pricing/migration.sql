-- Add commercial profile fields to members
ALTER TABLE "Member"
ADD COLUMN "commercialProfile" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "commercialNotes" TEXT;

-- Add pricing snapshot fields to sales
ALTER TABLE "Sale"
ADD COLUMN "originalAmount" DOUBLE PRECISION,
ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "finalAmount" DOUBLE PRECISION,
ADD COLUMN "discountReason" TEXT,
ADD COLUMN "discountSource" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "appliedByUserId" INTEGER;

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_appliedByUserId_fkey"
FOREIGN KEY ("appliedByUserId") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy sales so historical rows remain queryable
UPDATE "Sale"
SET
  "originalAmount" = "totalAmount",
  "finalAmount" = "totalAmount",
  "discountPercent" = 0,
  "discountAmount" = 0,
  "discountSource" = 'NONE'
WHERE
  "originalAmount" IS NULL
  OR "finalAmount" IS NULL
  OR "discountSource" <> 'NONE'
  OR "discountPercent" <> 0
  OR "discountAmount" <> 0;
