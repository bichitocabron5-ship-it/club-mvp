# Contract document snapshots — 7.4.4.1

Core only: no route, signing, polling, replay, PDF or sales/access integration.
The migration is authored but must not be executed as part of this block.

- Original bytes, SHA-256 (lowercase hex), length and actual capture time are
  stored once. Limit: 10 MiB (10485760 bytes), at least three PDF pages.
- The helper copies the input before async work, parses without saving the PDF,
  and verifies length, digest, PDF validity and exact byte equality on every
  create/reuse result. It never repairs an existing snapshot.
- Deduplication uses the unique digest. A failed concurrent INSERT is followed
  by a fresh lookup and verification. These are standalone Prisma operations,
  not an interactive transaction that would remain aborted after P2002.
- All three new references are nullable and have no default/backfill. Capturing
  today's file cannot establish what an existing signature accepted.
- Snapshot bytes are internal. There is no new route, list API or DTO containing
  them. Existing Prisma includes do not recursively include snapshot relations.

## Append-only and deployment review (7.4.4.5)

The migration blocks UPDATE, DELETE and TRUNCATE using a statement trigger and
a SECURITY INVOKER function, without assuming any runtime role name. It does
not use an upsert that could invoke UPDATE. Foreign keys use RESTRICT both ways.
It does not yet freeze the three nullable referencing fields; their lifecycle
will be addressed with the signing integrations.

No RLS, policies, grants or revocations are introduced in this block. Prisma
uses DATABASE_URL via lib/database-url.ts and lib/prisma.ts; prisma.config.ts
uses the same variable. SUPABASE_SERVICE_ROLE_KEY belongs to the separate
Storage client and does not establish Prisma's SQL role. The example URL and
CI placeholder do not prove the deployed role, ownership or BYPASSRLS status.
RLS without policies could therefore block SELECT/INSERT and was removed at
pre-commit review, together with the unverified PUBLIC privilege change.

The trigger itself does not intercept SELECT/INSERT and is sufficient for this
block's append-only scope. It does not grant access either. Actual SQL grants,
default privileges and Supabase Data API exposure remain unverified; no claim
is made that the table is inaccessible through an externally configured API.
Review those controls against the real runtime role before deployment in
7.4.4.5. The application adds no snapshot API or public consumer.

Triggers are not protection against an owner/superuser who can disable/drop
them or drop the table. An authorized future migration can explicitly remove
or replace the trigger; the protection is not irreversible. Role separation,
Data API exposure, backup retention and
restore tests require deployment-specific review in 7.4.4.5. The SQL checks
validate digest format and byte length, not the digest-to-bytes relationship
or PDF syntax: those are verified by the helper, including on reuse.

## Verification boundaries

Run `node scripts/test-contract-document-snapshot.mjs`. It exercises the actual
helper, Node crypto and pdf-lib with simulated Prisma persistence/concurrency;
migration checks are static. It does not prove PostgreSQL constraints, trigger
execution, RLS or live transaction behavior. A disposable PostgreSQL migration
and role/constraint/concurrency test is still needed before deployment.

The end-to-end provenance P1 and original-loss P2 are not closed by this core:
the public GET/POST and PDF still use their existing behavior until 7.4.4.2–4.
