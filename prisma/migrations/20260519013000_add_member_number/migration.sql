ALTER TABLE "Member"
ADD COLUMN "memberNumber" TEXT;

UPDATE "Member"
SET "memberNumber" = "id"::text
WHERE "memberNumber" IS NULL;

CREATE UNIQUE INDEX "Member_memberNumber_key" ON "Member"("memberNumber");
