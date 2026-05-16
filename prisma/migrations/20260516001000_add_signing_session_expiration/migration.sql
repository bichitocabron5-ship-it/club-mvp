ALTER TABLE "SigningSession"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "SigningSession"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

ALTER TABLE "SigningSession"
ALTER COLUMN "expiresAt" SET NOT NULL;
