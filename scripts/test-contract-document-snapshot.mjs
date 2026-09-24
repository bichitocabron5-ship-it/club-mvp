// Real production helper, crypto and pdf-lib; in-memory Prisma only.
// This suite does NOT execute SQL or prove PostgreSQL locking/trigger behavior.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("lib/contract-document-snapshot.ts");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clone = value => value ? { ...value, bytes: Buffer.from(value.bytes) } : null;
const uniqueError = target => new Prisma.PrismaClientKnownRequestError("Unique constraint", {
  code: "P2002", clientVersion: "7.8.0", meta: { target },
});

function harness(options = {}) {
  const rows = new Map();
  const calls = { reads: 0, creates: 0, conflicts: 0 };
  const delegate = {
    async findUnique({ where }) {
      calls.reads++;
      const row = clone(rows.get(where.sha256));
      // Capturing before await lets the test force two reads of an absent row.
      if (options.afterRead) await options.afterRead(calls.reads);
      return row;
    },
    async create({ data }) {
      calls.creates++;
      if (options.createError) throw options.createError;
      if (rows.has(data.sha256)) {
        calls.conflicts++;
        throw uniqueError(["sha256"]);
      }
      const row = { id: randomUUID(), capturedAt: new Date(), ...data };
      rows.set(data.sha256, clone(row));
      return options.corruptCreated ? options.corruptCreated(clone(row)) : clone(row);
    },
  };
  // Any attempted writes to templates/sessions/contracts fail immediately.
  const db = new Proxy({ contractDocumentSnapshot: delegate }, {
    get(target, key) {
      assert.equal(key, "contractDocumentSnapshot", "snapshot helper must not touch legacy models");
      return target[key];
    },
  });
  const exports = {};
  vm.runInNewContext(compiled, { exports, Buffer, Uint8Array, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/prisma") return { prisma: db };
    return require(name);
  } });
  return { ...exports, rows, calls };
}

async function pdfBytes(pages = 3, title = "Contract A") {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreationDate(new Date("2026-09-24T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-09-24T00:00:00Z"));
  for (let i = 0; i < pages; i++) pdf.addPage();
  return Buffer.from(await pdf.save());
}
const original = await pdfBytes();
const expectedHash = createHash("sha256").update(original).digest("hex");
const hasCode = code => error => error.code === code;
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

await test("SHA-256, original bytes, UUID, capture date and byteLength", async () => {
  const h = harness();
  const snapshot = await h.createOrReuseContractDocumentSnapshot(original);
  assert.equal(snapshot.sha256, expectedHash);
  assert.match(snapshot.sha256, /^[0-9a-f]{64}$/);
  assert.equal(snapshot.byteLength, original.length);
  assert.deepEqual(snapshot.bytes, original);
  assert.match(snapshot.id, /^[0-9a-f-]{36}$/);
  assert.ok(snapshot.capturedAt instanceof Date);
});
await test("identical bytes reuse one snapshot without UPDATE", async () => {
  const h = harness();
  const first = await h.createOrReuseContractDocumentSnapshot(original);
  const second = await h.createOrReuseContractDocumentSnapshot(Buffer.from(original));
  assert.equal(second.id, first.id);
  assert.equal(second.capturedAt.getTime(), first.capturedAt.getTime());
  assert.equal(h.rows.size, 1); assert.equal(h.calls.creates, 1);
});
await test("different original bytes create different snapshots", async () => {
  const h = harness();
  const first = await h.createOrReuseContractDocumentSnapshot(original);
  const second = await h.createOrReuseContractDocumentSnapshot(await pdfBytes(3, "Contract B"));
  assert.notEqual(second.id, first.id); assert.notEqual(second.sha256, first.sha256);
  assert.equal(h.rows.size, 2);
});
for (const [name, input, code] of [
  ["empty", Buffer.alloc(0), "DOCUMENT_EMPTY"],
  ["oversized", Buffer.alloc(10 * 1024 * 1024 + 1), "DOCUMENT_TOO_LARGE"],
  ["invalid PDF", Buffer.from("Not a PDF"), "DOCUMENT_INVALID_PDF"],
  ["insufficient pages", await pdfBytes(2), "DOCUMENT_INSUFFICIENT_PAGES"],
]) await test(`${name} rejected before database access`, async () => {
  const h = harness();
  await assert.rejects(h.createOrReuseContractDocumentSnapshot(input), hasCode(code));
  assert.deepEqual(h.calls, { reads: 0, creates: 0, conflicts: 0 });
});
await test("size boundary accepts exactly 10 MiB of original PDF bytes", async () => {
  const h = harness();
  const bytes = Buffer.alloc(h.CONTRACT_DOCUMENT_MAX_BYTES, 0x20);
  original.copy(bytes);
  const row = await h.createOrReuseContractDocumentSnapshot(bytes);
  assert.equal(row.byteLength, h.CONTRACT_DOCUMENT_MAX_BYTES);
  assert.deepEqual(row.bytes, bytes);
});
for (const field of ["bytes", "sha256", "byteLength"]) {
  await test(`corrupt ${field} rejected by verifier and deduplication`, async () => {
    const h = harness();
    await h.createOrReuseContractDocumentSnapshot(original);
    const stored = h.rows.get(expectedHash);
    if (field === "bytes") stored.bytes[20] ^= 1;
    if (field === "sha256") stored.sha256 = "0".repeat(64);
    if (field === "byteLength") stored.byteLength++;
    await assert.rejects(h.verifyContractDocumentSnapshot(stored), hasCode("DOCUMENT_SNAPSHOT_CORRUPT"));
    await assert.rejects(h.createOrReuseContractDocumentSnapshot(original), hasCode("DOCUMENT_SNAPSHOT_CORRUPT"));
    assert.equal(h.calls.creates, 1, "must not repair corrupt rows");
  });
}
await test("self-consistent invalid PDF in storage is rejected", async () => {
  const h = harness();
  const bytes = Buffer.from("not a PDF");
  await assert.rejects(h.verifyContractDocumentSnapshot({
    id: randomUUID(), capturedAt: new Date(), bytes, byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }), hasCode("DOCUMENT_INVALID_PDF"));
});
await test("self-consistent different bytes cannot satisfy a dedup lookup", async () => {
  const h = harness();
  const other = await h.createOrReuseContractDocumentSnapshot(await pdfBytes(3, "Other"));
  h.rows.set(expectedHash, other);
  await assert.rejects(h.createOrReuseContractDocumentSnapshot(original), hasCode("DOCUMENT_SNAPSHOT_CORRUPT"));
});
await test("creation result is verified, not trusted", async () => {
  const h = harness({ corruptCreated: row => ({ ...row, byteLength: row.byteLength + 1 }) });
  await assert.rejects(h.createOrReuseContractDocumentSnapshot(original), hasCode("DOCUMENT_SNAPSHOT_CORRUPT"));
});
await test("caller mutation during async validation cannot change stored bytes", async () => {
  const h = harness(); const input = Buffer.from(original);
  const pending = h.createOrReuseContractDocumentSnapshot(input);
  input.fill(0);
  const result = await pending;
  assert.deepEqual(result.bytes, original);
  result.bytes.fill(0);
  assert.deepEqual((await h.createOrReuseContractDocumentSnapshot(original)).bytes, original);
});
await test("two concurrent creates recover one unique snapshot (simulated Prisma)", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ afterRead: async count => {
    if (count === 2) release();
    if (count <= 2) await gate;
  } });
  const [first, second] = await Promise.all([
    h.createOrReuseContractDocumentSnapshot(original),
    h.createOrReuseContractDocumentSnapshot(original),
  ]);
  assert.equal(first.id, second.id); assert.deepEqual(first.bytes, second.bytes);
  assert.equal(h.rows.size, 1); assert.equal(h.calls.creates, 2); assert.equal(h.calls.conflicts, 1);
});
await test("unique race rejects corrupt/incompatible winners; other DB errors propagate", async () => {
  // Force the initial lookup to miss, then publish a simulated concurrent winner
  // before INSERT raises P2002. Recovery must validate it without repairing it.
  const otherBytes = await pdfBytes(3, "Incompatible winner");
  for (const defect of ["bytes", "sha256", "byteLength", "different bytes"]) {
    const winner = {
      id: randomUUID(), capturedAt: new Date(), bytes: Buffer.from(original),
      byteLength: original.length, sha256: expectedHash,
    };
    if (defect === "bytes") winner.bytes[20] ^= 1;
    if (defect === "sha256") winner.sha256 = "0".repeat(64);
    if (defect === "byteLength") winner.byteLength++;
    if (defect === "different bytes") {
      winner.bytes = otherBytes;
      winner.byteLength = otherBytes.length;
      winner.sha256 = createHash("sha256").update(otherBytes).digest("hex");
    }
    const before = clone(winner);
    const h = harness({ createError: uniqueError(["sha256"]), afterRead: async count => {
      if (count === 1) h.rows.set(expectedHash, winner);
    } });
    await assert.rejects(h.createOrReuseContractDocumentSnapshot(original), hasCode("DOCUMENT_SNAPSHOT_CORRUPT"));
    assert.equal(h.calls.reads, 2); assert.equal(h.calls.creates, 1);
    assert.deepEqual(h.rows.get(expectedHash), before);
  }
  for (const error of [uniqueError(["sha256"]), uniqueError(["id"]), new Error("DB unavailable")]) {
    const h = harness({ createError: error });
    await assert.rejects(h.createOrReuseContractDocumentSnapshot(original), actual => actual === error);
    assert.equal(h.rows.size, 0);
  }
});
await test("SQL/schema statically retain nullable legacy FKs and no backfill", async () => {
  const sql = read("prisma/migrations/20260924120000_contract_document_snapshot_core/migration.sql")
    .replace(/--[^\n]*/g, "");
  const schema = read("prisma/schema.prisma");
  const snapshotBlock = schema.match(/model ContractDocumentSnapshot \{([\s\S]*?)\n\}/)[1];
  for (const [prismaField, sqlField] of [
    [/id\s+String\s+@id @default\(uuid\(\)\) @db.Uuid/, '"id" UUID NOT NULL'],
    [/sha256\s+String\s+@unique @db.VarChar\(64\)/, '"sha256" VARCHAR(64) NOT NULL'],
    [/bytes\s+Bytes\s+@db.ByteA/, '"bytes" BYTEA NOT NULL'],
    [/byteLength\s+Int\s*\n/, '"byteLength" INTEGER NOT NULL'],
    [/capturedAt\s+DateTime\s+@default\(now\(\)\)/, '"capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
  ]) {
    assert.match(snapshotBlock, prismaField);
    assert.ok(sql.includes(sqlField));
  }
  assert.ok(sql.includes('CONSTRAINT "ContractDocumentSnapshot_pkey" PRIMARY KEY ("id")'));
  assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|MERGE\s+INTO)\b/i);
  for (const model of ["ContractTemplate", "SigningSession", "MemberContract"]) {
    assert.ok(sql.includes(`ALTER TABLE "${model}" ADD COLUMN "documentSnapshotId" UUID;`));
    assert.ok(sql.includes(`CREATE INDEX "${model}_documentSnapshotId_idx"`));
    assert.ok(sql.includes(`ALTER TABLE "${model}" ADD CONSTRAINT "${model}_documentSnapshotId_fkey"`));
    const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))[1];
    assert.match(block, /documentSnapshotId String\? @db.Uuid/);
    assert.match(block, /onDelete: Restrict, onUpdate: Restrict/);
  }
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) || []).length, 3);
  assert.ok(sql.includes("CHECK (\"sha256\" ~ '^[0-9a-f]{64}$')"));
  assert.ok(sql.includes('CHECK ("byteLength" > 0)'));
  assert.ok(sql.includes('CHECK ("byteLength" = octet_length("bytes"))'));
  assert.ok(sql.includes(`CHECK ("byteLength" <= ${harness().CONTRACT_DOCUMENT_MAX_BYTES})`));
  assert.match(sql, /CREATE UNIQUE INDEX "ContractDocumentSnapshot_sha256_key"/);
  assert.match(sql, /BEFORE UPDATE OR DELETE OR TRUNCATE/);
  assert.match(sql, /FOR EACH STATEMENT EXECUTE FUNCTION "reject_contract_document_snapshot_mutation"\(\)/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.doesNotMatch(sql, /ROW LEVEL SECURITY|CREATE POLICY|\bGRANT\b|\bREVOKE\b|SECURITY DEFINER/);
});
console.log(`${checks} snapshot checks passed; no real PostgreSQL execution.`);
