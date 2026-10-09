// Static core contract and offline Prisma schema diff only.
// No SQL is executed; these tests do not claim real PostgreSQL verification.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
const schema = read("prisma/schema.prisma");
const model = name => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))[0];
const document = model("MemberDocument");
const sql = read("prisma/migrations/20261001120000_member_document_core/migration.sql");
const statements = text => text.replace(/--[^\n]*/g, "").split(";").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
const baseline = JSON.parse(read("scripts/fixtures/member-document-core-baseline.json"));
const hash = text => createHash("sha256").update(text).digest("hex");

test("required metadata and storage references have matching Prisma/SQL scalar types", () => {
  const fields = {
    id: ["Int", "SERIAL"], memberId: ["Int", "INTEGER"], type: ["String", "TEXT"],
    originalName: ["String", "TEXT"], mimeType: ["String", "TEXT"], byteLength: ["Int", "INTEGER"],
    sha256: ["String", "VARCHAR\\(64\\)"], storageBucket: ["String", "TEXT"],
    storageKey: ["String", "TEXT"], createdAt: ["DateTime", "TIMESTAMP\\(3\\)"],
    createdByUserId: ["Int", "INTEGER"],
  };
  for (const [name, [prismaType, sqlType]] of Object.entries(fields)) {
    assert.match(document, new RegExp(`\\n\\s+${name}\\s+${prismaType}(?=\\s|$)`));
    assert.match(sql, new RegExp(`"${name}" ${sqlType} NOT NULL`));
  }
  // An exact scalar allowlist rejects credentials, temporary URLs and embedded bytes,
  // even if someone adds the same forbidden field to both schema and migration.
  const scalarNames = [...document.matchAll(/^\s+(\w+)\s+(?:Int|String|DateTime|Bytes|Boolean|Float|Decimal|BigInt|Json)\b/gm)]
    .map(match => match[1]);
  assert.deepEqual(scalarNames.sort(), Object.keys(fields).sort());
  assert.match(document, /\bid\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
  assert.match(document, /\bcreatedAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(document, /\bsha256\s+String\s+@db\.VarChar\(64\)/);
  assert.match(sql, /"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.doesNotMatch(document, /deletedAt|updatedAt|Url|version|@unique/);
});

test("Member and author are mandatory, with non-destructive foreign keys and inverse collections", () => {
  for (const [field, target] of [["memberId", "Member"], ["createdByUserId", "AppUser"]]) {
    assert.match(document, new RegExp(`${target}\\s+@relation\\([^\\n]*fields: \\[${field}\\], references: \\[id\\], onDelete: Restrict, onUpdate: Restrict\\)`));
    assert.ok(sql.includes(`FOREIGN KEY ("${field}") REFERENCES "${target}"("id") ON DELETE RESTRICT ON UPDATE RESTRICT`));
  }
  assert.match(model("Member"), /documents\s+MemberDocument\[\]/);
  assert.match(model("AppUser"), /createdMemberDocuments\s+MemberDocument\[\]\s+@relation\("MemberDocumentCreatedByUser"\)/);
});

test("multiple documents and repeated types/hashes are allowed by declared constraints", () => {
  assert.doesNotMatch(document, /@unique|@@unique/);
  assert.doesNotMatch(sql, /\bUNIQUE\b/);
  assert.deepEqual(document.match(/@@index\([^\n]+/g), ["@@index([memberId, createdAt])"]);
  assert.equal((sql.match(/CREATE INDEX/g) ?? []).length, 1);
  assert.match(sql, /PRIMARY KEY \("id"\)/);
});

test("classification follows String pattern and the internal union excludes photos/contracts", () => {
  const values = ["ID_FRONT", "ID_BACK", "AUTHORIZATION", "PROOF", "ANNEX", "OTHER"];
  const declaration = read("lib/types.ts").match(/export const MEMBER_DOCUMENT_TYPE_VALUES = \[([\s\S]*?)\] as const;/)[1];
  assert.deepEqual([...declaration.matchAll(/"([A-Z_]+)"/g)].map(m => m[1]), values);
  assert.match(document, /type\s+String\s+\/\/ ID_FRONT \| ID_BACK \| AUTHORIZATION \| PROOF \| ANNEX \| OTHER/);
  assert.match(read("lib/types.ts"), /export type MemberDocumentType = \(typeof MEMBER_DOCUMENT_TYPE_VALUES\)\[number\]/);
});

test("migration is additive with no backfill, triggers or changes to existing tables", () => {
  const items = statements(sql);
  assert.equal(items.length, 4);
  assert.match(items[0], /^CREATE TABLE "MemberDocument" /);
  assert.match(items[1], /^CREATE INDEX "MemberDocument_memberId_createdAt_idx" ON "MemberDocument"/);
  for (const item of items.slice(2)) assert.match(item, /^ALTER TABLE "MemberDocument" ADD CONSTRAINT .* FOREIGN KEY /);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE\s+"|DELETE\s+FROM|DROP|TRUNCATE|TRIGGER|SELECT|COPY)\b/i);
});

test("migration matches Prisma's offline PostgreSQL schema diff exactly", () => {
  const temporary = mkdtempSync(join(tmpdir(), "member-document-core-"));
  try {
    const before = schema.replace(document, "")
      .replace(/^.*documents\s+MemberDocument\[\].*\n/m, "")
      .replace(/^.*createdMemberDocuments\s+MemberDocument\[\].*\n/m, "");
    const path = join(temporary, "before.prisma");
    writeFileSync(path, before);
    const generated = execFileSync(process.execPath, [
      join(root, "node_modules/prisma/build/index.js"), "migrate", "diff",
      "--from-schema", path, "--to-schema", join(root, "prisma/schema.prisma"), "--script",
    ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.deepEqual(statements(sql), statements(generated));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("legacy Member fields and complete contract/snapshot models match the pre-sprint baseline", () => {
  for (const [name, expected] of Object.entries(baseline.models)) {
    const current = name === "Member" ? model(name).replace(/^.*documents\s+MemberDocument\[\].*\n/m, "") : model(name);
    assert.equal(hash(current), expected, `${name} must remain unchanged`);
  }
});

test("only the explicit document/member read endpoints are added; existing endpoints do not expose the model", () => {
  const paths = readdirSync(join(root, "app/api"), { recursive: true })
    .filter(p => statSync(join(root, "app/api", p)).isFile()).map(p => p.replaceAll("\\", "/")).sort();
  assert.deepEqual(paths, [...baseline.apiFiles, "members/[id]/member-documents/route.ts",
    "members/[id]/member-documents/[documentId]/content/route.ts",
    "members/[id]/identity/route.ts", "members/[id]/registration/route.ts",
    "members/[id]/overview/route.ts"].sort());
  for (const path of baseline.apiFiles) assert.doesNotMatch(read(`app/api/${path}`), /\.memberDocument\b|\bMemberDocumentType\b|\bMEMBER_DOCUMENT_TYPE_VALUES\b/);
});

test("immutability policy explicitly requires new records for replacements without enforcement claims", () => {
  assert.match(schema, /all scalar fields are immutable after creation/);
  assert.match(schema, /Replacements create new rows; no update\/delete API or DB immutability trigger yet/);
});
