// Static migration contract, following the snapshot migration tests' read/assert pattern.
// No database connection, SQL execution, or claim of real PostgreSQL verification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('prisma/migrations/20260928120000_contract_template_single_active/migration.sql')
  .replace(/--[^\n]*/g, '').trim();
const statements = sql.split(';').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
const schema = read('prisma/schema.prisma');

test('atomic migration takes the writer advisory lock before table access, with bounded waits', () => {
  assert.deepEqual(statements.slice(0, 5), [
    'BEGIN ISOLATION LEVEL READ COMMITTED',
    "SET LOCAL lock_timeout = '15s'",
    "SET LOCAL statement_timeout = '60s'",
    'SELECT pg_advisory_xact_lock(1129598288, 1)',
    'LOCK TABLE "ContractTemplate" IN SHARE ROW EXCLUSIVE MODE',
  ]);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(read('lib/contract-templates.ts'), /SELECT pg_advisory_xact_lock\(1129598288, 1\)/);
});

test('cleanup re-reads only actives and keeps exactly the newest row, breaking ties by id', () => {
  assert.equal(statements[5], 'WITH ranked_active AS ( SELECT "id", row_number() OVER (ORDER BY "createdAt" DESC, "id" DESC) AS position FROM "ContractTemplate" WHERE "active" = true ) UPDATE "ContractTemplate" AS template SET "active" = false FROM ranked_active WHERE template."id" = ranked_active."id" AND ranked_active.position > 1');
  assert.doesNotMatch(sql, /"id"\s*(?:=|IN\s*\()\s*\d/i);
  assert.doesNotMatch(sql, /documentSnapshotId|provenance/i);
});

test('unique index covers true only: zero actives and unlimited false rows remain valid', () => {
  assert.equal(statements[6], 'CREATE UNIQUE INDEX "ContractTemplate_single_active_key" ON "ContractTemplate" ("active") WHERE "active" = true');
  assert.doesNotMatch(sql, /CONCURRENTLY|IF NOT EXISTS|EXCEPTION|ROLLBACK/i);
});

test('statement allowlist excludes all unrelated DML, provenance changes and intermediate commits', () => {
  // Every statement is checked above; rejecting extra statements prevents hidden DML.
  assert.equal(statements.length, 8);
  assert.equal((sql.match(/\bUPDATE\b/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /\b(?:DELETE|INSERT|MERGE|TRUNCATE|DROP|ALTER)\b/i);
  assert.doesNotMatch(sql, /SigningSession|MemberContract|ContractDocumentSnapshot/);
});

test('DB-managed partial index does not enable preview or impose full boolean uniqueness', () => {
  assert.doesNotMatch(schema, /previewFeatures\s*=\s*\[[^\]]*"partialIndexes"/);
  const model = schema.match(/model ContractTemplate \{([\s\S]*?)\n\}/)[1];
  const declarations = model.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(declarations, /@@unique\(\[active\]/);
  assert.doesNotMatch(declarations, /active\s+Boolean[^\n]*@unique/);
  assert.match(declarations, /active\s+Boolean\s+@default\(true\)/);
  assert.match(model, /documentSnapshotId String\? @db.Uuid/);
});

test('legacy historical resolution still uses ID independently of active', () => {
  const resolver = read('lib/contract-templates.ts').split('export async function resolveContractTemplateForContract')[1];
  assert.match(resolver, /findUnique\(\{\s*where: \{ id: contractTemplateId \},\s*\}\)/);
  assert.match(resolver, /if \(template\) \{\s*return template;/);
});
