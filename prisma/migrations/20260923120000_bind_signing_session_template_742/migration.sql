ALTER TABLE "SigningSession" ADD COLUMN "contractTemplateId" INTEGER;

-- Only the associated signed contract provides historical evidence.
-- Pending sessions without a contract deliberately remain unresolved.
UPDATE "SigningSession" AS s
SET "contractTemplateId" = c."contractTemplateId"
FROM "MemberContract" AS c
WHERE c."signingSessionId" = s."id"
  AND s."contractTemplateId" IS NULL
  AND c."contractTemplateId" IS NOT NULL;

CREATE INDEX "SigningSession_contractTemplateId_idx"
ON "SigningSession"("contractTemplateId");

ALTER TABLE "SigningSession"
ADD CONSTRAINT "SigningSession_contractTemplateId_fkey"
FOREIGN KEY ("contractTemplateId") REFERENCES "ContractTemplate"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
