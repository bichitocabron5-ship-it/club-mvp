BEGIN ISOLATION LEVEL READ COMMITTED;

-- Fail closed instead of waiting indefinitely during deployment.
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- Same two-int namespace and lock order as createContractTemplate:
-- advisory lock FIRST, then table/row locks. Never reverse this order.
SELECT pg_advisory_xact_lock(1129598288, 1);
-- Blocks all INSERT/UPDATE/DELETE, including non-cooperating writers, while
-- allowing ordinary SELECTs. Held through cleanup, index creation and COMMIT.
LOCK TABLE "ContractTemplate" IN SHARE ROW EXCLUSIVE MODE;

-- Re-read committed actives only after both locks. Snapshot is not a ranking
-- criterion; historical provenance and every column except active are preserved.
WITH ranked_active AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt" DESC, "id" DESC) AS position
    FROM "ContractTemplate"
    WHERE "active" = true
)
UPDATE "ContractTemplate" AS template
SET "active" = false
FROM ranked_active
WHERE template."id" = ranked_active."id"
  AND ranked_active.position > 1;

-- No IF NOT EXISTS: an unexpected object with this name must abort the migration.
CREATE UNIQUE INDEX "ContractTemplate_single_active_key"
    ON "ContractTemplate" ("active") WHERE "active" = true;

COMMIT;
