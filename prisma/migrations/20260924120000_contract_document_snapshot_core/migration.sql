-- Core only: nullable associations, no historical backfill and no changes to signatures.
-- UUIDs are supplied by Prisma's uuid() default, not a database extension.
CREATE TABLE "ContractDocumentSnapshot" (
    "id" UUID NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocumentSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractDocumentSnapshot_sha256_format_check"
        CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ContractDocumentSnapshot_byteLength_positive_check"
        CHECK ("byteLength" > 0),
    CONSTRAINT "ContractDocumentSnapshot_byteLength_matches_check"
        CHECK ("byteLength" = octet_length("bytes")),
    -- 10 MiB; keep aligned with CONTRACT_DOCUMENT_MAX_BYTES in the helper.
    CONSTRAINT "ContractDocumentSnapshot_byteLength_max_check"
        CHECK ("byteLength" <= 10485760)
);

CREATE UNIQUE INDEX "ContractDocumentSnapshot_sha256_key" ON "ContractDocumentSnapshot"("sha256");

ALTER TABLE "ContractTemplate" ADD COLUMN "documentSnapshotId" UUID;
ALTER TABLE "SigningSession" ADD COLUMN "documentSnapshotId" UUID;
ALTER TABLE "MemberContract" ADD COLUMN "documentSnapshotId" UUID;

CREATE INDEX "ContractTemplate_documentSnapshotId_idx" ON "ContractTemplate"("documentSnapshotId");
CREATE INDEX "SigningSession_documentSnapshotId_idx" ON "SigningSession"("documentSnapshotId");
CREATE INDEX "MemberContract_documentSnapshotId_idx" ON "MemberContract"("documentSnapshotId");

ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_documentSnapshotId_fkey"
    FOREIGN KEY ("documentSnapshotId") REFERENCES "ContractDocumentSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "SigningSession" ADD CONSTRAINT "SigningSession_documentSnapshotId_fkey"
    FOREIGN KEY ("documentSnapshotId") REFERENCES "ContractDocumentSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MemberContract" ADD CONSTRAINT "MemberContract_documentSnapshotId_fkey"
    FOREIGN KEY ("documentSnapshotId") REFERENCES "ContractDocumentSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Role-independent append-only protection, including unreferenced snapshots.
CREATE FUNCTION "reject_contract_document_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'ContractDocumentSnapshot is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ContractDocumentSnapshot_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ContractDocumentSnapshot"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_contract_document_snapshot_mutation"();

-- No RLS or privilege changes in this block: DATABASE_URL's production role
-- is not established by the repository. Review access/Data API exposure in 7.4.4.5.

-- Owners/superusers can disable/drop triggers. Role separation, backup/retention
-- and verification against a real PostgreSQL instance remain for 7.4.4.5.
