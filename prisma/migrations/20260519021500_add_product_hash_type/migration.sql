ALTER TABLE "Product"
ADD COLUMN "hashType" TEXT;

UPDATE "Product"
SET
  "hashType" = "category",
  "category" = 'HASH'
WHERE "category" IN ('FROZEN', 'STATIC', 'DRY', 'SEMI_DRY');
