// Real route, persisted auth, validation, crypto, sharp and pdf-lib.
// Controlled Storage and transactional Prisma doubles; no remote IO or SQL.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";

const require = createRequire(import.meta.url);
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const plain = x => JSON.parse(JSON.stringify(x));
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
const pdf = await PDFDocument.create(); pdf.addPage();
const pdfBytes = await pdf.save();
function form(bytes = png, mime = "image/png", name = "document.png", type = "OTHER") {
  const result = new FormData(); result.set("file", new File([bytes], name, { type: mime })); result.set("type", type); return result;
}
function harness(options = {}) {
  const objects = new Map(), rows = [], audits = [], uploads = [], removals = [], signals = [];
  const originalError = new Error("PRIVATE_DB_ERROR");
  let transactions = 0;
  const db = {
    appUser: { findUnique: async () => options.missingUser ? null : { id: 7, active: options.active ?? true, role: options.role ?? "STAFF" } },
    member: { findUnique: async () => options.missingMember ? null : { id: 17 } },
    async $transaction(callback) {
      transactions++;
      const pending = [], pendingAudit = [];
      const result = await callback({
        memberDocument: { create: async ({ data, select }) => {
          if (options.dbFail) throw originalError;
          const row = { id: rows.length + 1, createdAt: new Date(), ...data }; pending.push(row);
          return Object.fromEntries(Object.keys(select).map(k => [k, row[k]]));
        } },
        auditLog: { create: async ({ data }) => { if (options.auditFail) throw originalError; pendingAudit.push(data); } },
      });
      rows.push(...pending); audits.push(...pendingAudit);
      if (options.commitUncertain) throw originalError;
      return result;
    },
  };
  const storage = {
    getBucket: async bucket => { assert.equal(bucket, "member-documents"); return { data: { public: options.public ?? false }, error: options.bucketFail }; },
    from: bucket => { assert.equal(bucket, "member-documents"); return {
      upload: async (key, bytes, settings) => {
        uploads.push({ key, bytes, settings });
        assert.equal(settings.upsert, false);
        if (options.collision) { objects.set(key, Buffer.from("PREEXISTING")); return { error: {} }; }
        if (options.storageFail) return { error: {} };
        assert.equal(objects.has(key), false); objects.set(key, Buffer.from(bytes));
        if (options.uploadUncertain) throw new Error("timeout");
        return { data: { path: key } };
      },
      remove: async keys => { removals.push(...keys); if (options.cleanupFail) return { error: {} }; keys.forEach(k => objects.delete(k)); return { error: null }; },
    }; },
  };
  const mocks = {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage }) },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "7", role: options.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
  };
  const cache = {};
  function load(path) {
    if (cache[path]) return cache[path];
    const exports = {}; cache[path] = exports;
    vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, Buffer, File, FormData, Response, Request, Uint8Array, process,
        console: { error: (...args) => signals.push(plain(args)) },
        require: name => mocks[name] ?? (name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name)),
      });
    return exports;
  }
  const writer = load("lib/member-document-writer.ts");
  const route = load("app/api/members/[id]/member-documents/route.ts");
  return { objects, rows, audits, uploads, removals, signals, writer, originalError,
    get transactions() { return transactions; },
    post: (body = form(), id = "17", headers) => route.POST(new Request("http://local/api/members/17/member-documents", { method: "POST", body, headers }), { params: Promise.resolve({ id }) }),
  };
}

test("401/403 and authority are derived from persisted AppUser, never JWT role", async () => {
  for (const [options, status] of [[{ noSession: true }, 401], [{ missingUser: true }, 401], [{ active: false }, 401], [{ role: "MEMBER" }, 403], [{ role: "STAFF", jwtRole: "MEMBER" }, 201], [{ role: "ADMIN" }, 201]]) {
    const h = harness(options); assert.equal((await h.post()).status, status);
    if (status !== 201) { assert.equal(h.uploads.length, 0); assert.equal(h.transactions, 0); }
  }
});
test("strict path ID and member existence", async () => {
  const h = harness();
  for (const id of ["0", "-1", "1.1", "1e2", " 17", "2147483648", "abc"]) assert.equal((await h.post(form(), id)).status, 400);
  assert.equal((await harness({ missingMember: true }).post()).status, 404); assert.equal(h.uploads.length, 0);
});
test("strict fields, duplicates and type allowlist", async () => {
  const h = harness();
  for (const field of ["memberId", "createdByUserId", "sha256", "byteLength", "storageBucket", "storageKey", "createdAt", "signedUrl", "front", "type", "file"]) {
    const f = form(); f.append(field, "forged"); assert.equal((await h.post(f)).status, 400);
  }
  for (const type of ["PHOTO", "CONTRACT", "", "other"]) assert.equal((await h.post(form(png, "image/png", "a", type))).status, 400);
  for (const type of ["ID_FRONT", "ID_BACK", "AUTHORIZATION", "PROOF", "ANNEX", "OTHER"]) assert.equal((await h.post(form(png, "image/png", "a", type))).status, 201);
});
test("empty, oversize, forbidden and spoofed MIME, malformed multipart and bounded stream", async () => {
  const h = harness();
  for (const [bytes, mime, status] of [[Buffer.alloc(0), "image/png", 400], [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png", 413], [png, "text/html", 415], [png, "image/svg+xml", 415], [png, "application/javascript", 415], [png, "image/jpeg", 400], [Buffer.from("<svg/>"), "image/png", 400]]) {
    assert.equal((await h.post(form(bytes, mime))).status, status);
  }
  assert.equal((await h.post("broken", "17", { "content-type": "multipart/form-data; boundary=x" })).status, 400);
  assert.equal((await h.post("{}", "17", { "content-type": "application/json" })).status, 415);
  assert.equal((await h.post(form(), "17", { "content-length": "999999999" })).status, 413);
  assert.equal((await h.post(Buffer.alloc(6 * 1024 * 1024), "17", { "content-type": "multipart/form-data; boundary=x" })).status, 413);
  assert.equal(h.uploads.length, 0);
});
test("PDF header, structure, EOF and active content; images fully decoded", async () => {
  const h = harness();
  assert.equal((await h.post(form(pdfBytes, "application/pdf"))).status, 201);
  for (const bytes of [png, Buffer.from("%PDF-1.7\ninvalid\n%%EOF"), Buffer.from("<html/>"), Buffer.from(pdfBytes).subarray(0, 40)]) assert.equal((await h.post(form(bytes, "application/pdf"))).status, 400);
  const active = await PDFDocument.create(); active.addPage(); active.catalog.set(PDFName.of("OpenAction"), active.context.obj({ S: "JavaScript", JS: PDFString.of("alert(1)") }));
  assert.equal((await h.post(form(await active.save(), "application/pdf"))).status, 400);
  for (const [format, mime] of [["jpeg", "image/jpeg"], ["webp", "image/webp"], ["png", "image/png"]]) {
    const bytes = await sharp(png)[format]().toBuffer();
    assert.equal((await h.post(form(bytes, mime))).status, 201);
    assert.equal((await h.post(form(bytes.subarray(0, Math.floor(bytes.length / 2)), mime))).status, 400);
  }
});
test("private bucket checked; public/unknown configuration fails closed", async () => {
  for (const options of [{ public: true }, { bucketFail: {} }]) { const h = harness(options); assert.equal((await h.post()).status, 503); assert.equal(h.uploads.length, 0); }
});
test("server key/hash/size/actor, sanitized name, minimal DTO and audit", async () => {
  const h = harness(); const response = await h.post(form(png, "image/png", '../../<script>\u202eevil.png'));
  assert.equal(response.status, 201); const dto = await response.json(); const row = h.rows[0];
  assert.deepEqual(Object.keys(dto).sort(), ["id", "type", "originalName", "mimeType", "byteLength", "createdAt"].sort());
  assert.doesNotMatch(dto.originalName, /[<>/\\\u202e]/); assert.equal(row.createdByUserId, 7); assert.equal(row.memberId, 17);
  assert.equal(row.sha256, createHash("sha256").update(png).digest("hex")); assert.equal(row.byteLength, png.length);
  assert.match(row.storageKey, /^member-document-objects\/[0-9a-f-]{36}$/); assert.deepEqual(h.objects.get(row.storageKey), png);
  assert.equal(h.audits[0].actorUserId, 7); assert.equal(h.audits[0].action, "MEMBER_DOCUMENT_CREATED");
  assert.deepEqual(Object.keys(h.audits[0].metadata).sort(), ["memberId", "documentId", "type", "byteLength", "mimeType"].sort());
});
test("upload errors, collisions and uncertain uploads never create DB or delete objects", async () => {
  for (const options of [{ storageFail: true }, { collision: true }, { uploadUncertain: true }]) {
    const h = harness(options); assert.equal((await h.post()).status, 503); assert.equal(h.transactions, 0); assert.equal(h.removals.length, 0);
    assert.match(JSON.stringify(h.signals), /UPLOAD_FAILED_OR_UNCERTAIN/);
  }
});
test("DB/audit failure rolls back and cleans only confirmed new object; preserves original error", async () => {
  for (const options of [{ dbFail: true }, { auditFail: true }, { auditFail: true, cleanupFail: true }]) {
    const h = harness(options); h.objects.set("unrelated", Buffer.from("keep"));
    await assert.rejects(h.writer.createMemberDocument(17, 7, form()), error => error === h.originalError);
    assert.equal(h.rows.length, 0); assert.equal(h.audits.length, 0); assert.deepEqual(h.removals, [h.uploads[0].key]); assert.ok(h.objects.has("unrelated"));
    assert.equal(h.objects.has(h.uploads[0].key), !!options.cleanupFail);
    assert.doesNotMatch(JSON.stringify(h.signals), /PRIVATE_DB_ERROR|storageKey|document.png|sha256/);
    if (options.cleanupFail) assert.match(JSON.stringify(h.signals), /CLEANUP_FAILED/);
  }
});
test("uncertain commit preserves the object and signals reconciliation", async () => {
  const h = harness({ commitUncertain: true }); assert.equal((await h.post()).status, 500);
  assert.equal(h.rows.length, 1); assert.equal(h.removals.length, 0); assert.equal(h.objects.size, 1);
  assert.match(JSON.stringify(h.signals), /DB_COMMIT_UNCERTAIN/);
});
test("retries and concurrent requests generate distinct keys without hash deduplication", async () => {
  const h = harness(); const responses = await Promise.all([h.post(), h.post(), h.post()]);
  assert.ok(responses.every(r => r.status === 201)); assert.equal(new Set(h.uploads.map(u => u.key)).size, 3);
  assert.equal(h.rows.length, 3); assert.equal(new Set(h.rows.map(r => r.sha256)).size, 1);
});
