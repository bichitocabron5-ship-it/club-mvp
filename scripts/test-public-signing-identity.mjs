import { createHash } from "node:crypto";
// Real POST/GET, serializer, DNI normalizer, body validation, rate limiter and PDF
// generator; controlled Prisma/storage dependencies. No database or credentials.
// Serialized transaction doubles test route branches, NOT PostgreSQL concurrency.
// updatedAt is a sentinel: current Member schema does not have that column.
// Run: node scripts/test-public-signing-identity.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client");
const root = resolve(import.meta.dirname, "..");
const copy = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
export function loader(mocks) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, name.slice(2) + ".ts");
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(code, {
      exports, require: load, console, Response, Request, URL, Buffer, Error, Date,
    }, { filename });
    return exports;
  }
  return load;
}
const unique = target => new Prisma.PrismaClientKnownRequestError("PRIVATE_SQL_DETAILS", {
  code: "P2002", clientVersion: "7.8.0", meta: { target },
});
const token = "a".repeat(48);
const signatureImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const original = {
  id: 17, memberNumber: "M17", fullName: "Nombre original", dni: "DNIA",
  phone: "111", email: "a@example.com", photoUrl: "private-photo",
  dniFrontUrl: "private-front", dniBackUrl: "private-back", active: true,
  joinedAt: new Date("2025-01-01"), expiresAt: new Date("2030-01-01"),
  rfidCode: "PRIVATE_RFID", createdAt: new Date("2025-01-01"),
  commercialProfile: "STANDARD", discountPercent: 3, commercialNotes: "private notes",
  updatedAt: new Date("2026-01-01"),
};
const other = { ...original, id: 18, memberNumber: "M18", dni: "DNIB", fullName: "Otro socio privado" };
const identical = { fullName: original.fullName, dni: original.dni, phone: original.phone, email: original.email };
const different = { fullName: "Nombre contractual", dni: "DNI-B", phone: "222", email: "b@example.com" };
const previous = {
  id: 40, memberId: original.id, signingSessionId: null, contractTemplateId: 3, documentSnapshotId: null,
  ...identical, address: "Previous address", birthPlace: "Previous place",
  birthDate: new Date("1990-01-01"), consumptionGrams: 37,
  signatureImage, signedAt: new Date("2025-01-01"), signedPdfUrl: null,
};
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const templateDocument = await PDFDocument.create();
for (let i = 0; i < 3; i++) templateDocument.addPage();
export const snapshotId = "11111111-1111-4111-8111-111111111111";
export const templateBytes = await templateDocument.save();

export function harness(options = {}) {
  const template = { id: 3, name: "Template", version: "1", fileUrl: "template-ref", documentSnapshotId: snapshotId, active: options.templateActive ?? true };
  const members = copy([original, other]);
  let state = {
    session: {
      id: 9, token, memberId: original.id, status: options.status ?? "PENDING",
      documentSnapshotId: Object.hasOwn(options, "snapshotId") ? options.snapshotId : snapshotId,
      contractTemplateId: Object.hasOwn(options, "templateId") ? options.templateId : 3,
      expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 3600_000)),
      signatureImage: null, signedAt: null, createdAt: new Date(),
    },
    contracts: options.previous ? [copy(previous)] : [], audits: [],
  };
  const initial = copy(state);
  const calls = { transactions: 0, rollbacks: 0, memberWrites: 0, creates: 0, audits: 0, recoveries: 0, globalRecoveries: 0, pdf: 0, pdfUpdates: 0, settingsReads: 0, settingsLocks: 0 };
  let monthlyLimit = Object.hasOwn(options, "monthlyLimit") ? options.monthlyLimit : 30;
  let settingsError = options.settingsError;
  const readSettings = () => {
    if (settingsError) throw settingsError;
    return monthlyLimit === undefined ? null : { defaultMonthlyLimitG: monthlyLimit };
  };
  const pdfSources = [], pdfText = [], uploads = [];
  const gate = deferred();
  let initialReads = 0, tail = Promise.resolve();
  const memberDelegate = new Proxy({}, { get() {
    calls.memberWrites++;
    throw new Error("Member delegate forbidden in public signing");
  } });
  const latest = (contracts, memberId) => contracts.filter(c => c.memberId === memberId)
    .sort((a, b) => b.signedAt - a.signedAt || b.id - a.id)[0] ?? null;
  const prisma = {
    contractDocumentSnapshot: { async findUnique({ where }) {
      await options.beforeSnapshotRead?.();
      if (options.snapshotMissing) return null;
      return { id: where.id, bytes: templateBytes, byteLength: templateBytes.length,
        sha256: options.snapshotCorrupt ? "0".repeat(64) : createHash("sha256").update(templateBytes).digest("hex") };
    } },
    contractTemplate: { async findUnique({ where }) {
      if (options.templateDbError) throw new Error("PRIVATE_TEMPLATE_DB");
      return where.id === 3 ? copy(template) : null;
    } },
    clubSetting: { async findUnique({ where, select }) {
      calls.settingsReads++;
      assert.deepEqual(plain(where), { id: 1 });
      assert.deepEqual(plain(select), { defaultMonthlyLimitG: true });
      return readSettings();
    } },
    member: memberDelegate,
    signingSession: { async findUnique({ where }) {
      if (where.token !== token) return null;
      const snapshot = copy({ ...state.session, member: members[0], contractTemplate: state.session.contractTemplateId === 3 ? template : null, contract: state.contracts.find(c => c.signingSessionId === state.session.id) ?? null });
      if (options.simultaneous && ++initialReads <= 2) {
        if (initialReads === 2) gate.resolve();
        await gate.promise;
      }
      return snapshot;
    } },
    memberContract: {
      async findFirst({ where }) { return copy(latest(state.contracts, where.memberId)); },
      async findUnique({ where }) {
        if (where.signingSessionId !== undefined) {
          calls.globalRecoveries++;
          return copy(state.contracts.find(c => c.signingSessionId === where.signingSessionId) ?? null);
        }
        const contract = state.contracts.find(c => c.id === where.id);
        if (!contract) return null;
        assert.equal(state.session.status, "SIGNED");
        assert.equal(state.audits.length, 1, "PDF must run after mandatory audit commit");
        pdfSources.push(copy(contract));
        return copy({ ...contract, member: members[0], contractTemplate: template });
      },
      async update({ where, data }) {
        calls.pdfUpdates++;
        const contract = state.contracts.find(c => c.id === where.id);
        Object.assign(contract, copy(data));
        return copy(contract);
      },
    },
    async $transaction(fn) {
      calls.transactions++;
      const wait = tail;
      const release = deferred();
      tail = release.promise;
      await wait;
      options.beforeClaim?.(state);
      const staged = copy(state);
      const tx = {
        async $queryRaw(strings, ...values) {
          const sql = strings.join("?");
          if (sql.includes('FROM "Member"')) return [{ id: 17 }];
          if (sql.includes('FROM "SigningSession"') && sql.includes('FOR UPDATE')) return [{ id: 9 }];
          if (sql.includes('FROM "SigningSession"') && sql.includes('clock_timestamp')) {
            return staged.session.expiresAt <= new Date() ? [{ id: 9 }] : [];
          }
          if (sql.includes('UPDATE "SigningSession"')) {
            assert.match(sql, /"expiresAt" > clock_timestamp\(\)/);
            const [signatureImage, id, memberId, templateId, documentSnapshotId] = values;
            const row = staged.session;
            if (row.id !== id || row.memberId !== memberId || row.status !== "PENDING" || row.contractTemplateId !== templateId || row.documentSnapshotId !== documentSnapshotId || row.expiresAt <= new Date()) return [];
            Object.assign(row, { status: "SIGNED", signatureImage, signedAt: new Date() });
            return [{ id }];
          }
          calls.settingsLocks++;
          assert.equal(staged.session.status, "SIGNED", "claim session before settings read");
          assert.match(strings.join("?"), /SELECT "defaultMonthlyLimitG" FROM "ClubSetting" WHERE "id" = 1 FOR SHARE/);
          assert.equal(values.length, 0);
          const row = readSettings();
          return row ? [row] : [];
        },
        member: memberDelegate,
        signingSession: { async updateMany({ where, data }) {
          assert.deepEqual(plain(where), { id: 9, status: "PENDING", memberId: 17, contractTemplateId: 3, documentSnapshotId: snapshotId });
          if (staged.session.status !== where.status || staged.session.memberId !== where.memberId || staged.session.contractTemplateId !== where.contractTemplateId || staged.session.documentSnapshotId !== where.documentSnapshotId) return { count: 0 };
          Object.assign(staged.session, copy(data));
          return { count: 1 };
        }, async findUnique() {
          options.beforeClaimConfirmation?.(staged);
          return copy({ ...staged.session, member: members[0], contract: null,
            contractTemplate: staged.session.contractTemplateId ? { ...template, id: staged.session.contractTemplateId } : null });
        } },
        memberContract: {
          async findUnique({ where }) {
            calls.recoveries++;
            return copy(staged.contracts.find(c => c.signingSessionId === where.signingSessionId) ?? null);
          },
          async create({ data }) {
            calls.creates++;
            assert.equal(staged.session.status, "SIGNED");
            assert.equal(data.memberId, original.id);
            assert.equal(data.signingSessionId, 9);
            assert.equal(data.contractTemplateId, 3);
            assert.equal(data.documentSnapshotId, staged.session.documentSnapshotId);
            if (options.contractError) throw options.contractError;
            if (staged.contracts.some(c => c.signingSessionId === data.signingSessionId)) throw unique(["signingSessionId"]);
            const contract = { id: 41, signedAt: new Date(), signedPdfUrl: null, ...copy(data) };
            staged.contracts.push(contract);
            return copy(contract);
          },
        },
        auditLog: { async create({ data }) {
          calls.audits++;
          assert.equal(staged.session.status, "SIGNED");
          assert.equal(staged.contracts.at(-1).id, Number(data.entityId));
          assert.equal(state.audits.length, 0, "audit runs before commit");
          if (options.auditError) throw options.auditError;
          staged.audits.push(copy(data));
          return copy(data);
        } },
      };
      try {
        const result = await fn(tx);
        state = staged;
        options.onCommit?.();
        return result;
      } catch (error) {
        calls.rollbacks++;
        throw error;
      } finally { release.resolve(); }
    },
  };
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma },
    "@/lib/contract-templates": { findActiveContractTemplate: async () => { throw new Error("Active lookup forbidden"); }, resolveContractTemplateForContract: async () => { throw new Error("Fallback forbidden"); } },
    "@/lib/storage": {
      isStorageUrlsDisabled: () => options.storageDisabled ?? false,
      parseStorageUrl: ref => ref === "template-ref" ? { bucket: "contract-templates", path: ref } : JSON.parse(ref),
      buildStoragePublicUrl: () => "https://storage.invalid/controlled",
      buildStoredStorageRef: (bucket, path) => JSON.stringify({ bucket, path }),
      createStorageSignedUrl: async (_ref, settings) => {
        options.onSignedUrl?.(settings, _ref);
        return options.urlMissing ? null : "https://storage.invalid/controlled";
      },
    },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from(bucket) {
      if (bucket === "contract-templates") return { async download() {
        await options.beforeDocumentRead?.();
        return options.objectMissing ? { error: true } : {
          data: new Blob([options.objectEmpty ? new Uint8Array() : templateBytes]), error: null,
        };
      } };
      assert.equal(bucket, "signed-contracts");
      return { async upload(path, bytes) {
        uploads.push({ path, size: bytes.length });
        return { error: null };
      } };
    } } }) },
    "pdf-lib": {
      ...require("pdf-lib"),
      PDFDocument: { async load(bytes) {
        const doc = await PDFDocument.load(bytes);
        for (const page of doc.getPages()) {
          const draw = page.drawText.bind(page);
          page.drawText = (text, settings) => { pdfText.push(text); return draw(text, settings); };
        }
        return doc;
      } },
    },
  };
  const load = loader(mocks);
  const realPdf = load("@/lib/contract-pdf");
  mocks["@/lib/contract-pdf"] = { async ensureSignedContractPdf(id) {
    calls.pdf++;
    if (options.pdfError) throw new Error("Controlled PDF failure");
    return realPdf.ensureSignedContractPdf(id);
  } };
  const { POST, GET } = load("@/app/api/signing-sessions/[token]/route");
  return {
    calls, initial, pdfSources, pdfText, uploads,
    setContractSnapshotId(id) { state.contracts.find(c => c.signingSessionId === 9).documentSnapshotId = id; },
    setExpiresAt(value) { state.session.expiresAt = value; },
    setSnapshotId(id) { state.session.documentSnapshotId = id; },
    setTemplateSnapshotId(id) { template.documentSnapshotId = id; },
    setFileUrl(url) { template.fileUrl = url; },
    setSessionTemplateId(id) { state.session.contractTemplateId = id; },
    setContractTemplateId(id) { state.contracts.find(c => c.signingSessionId === 9).contractTemplateId = id; },
    setTemplateActive(value) { template.active = value; },
    setMonthlyLimit(value) { monthlyLimit = value; },
    setSettingsError(value) { settingsError = value; },
    get members() { return copy(members); }, get state() { return copy(state); },
    normalize: load("@/lib/member-identity").normalizeMemberIdentity,
    async post(form = identical, requestToken = token, expectedConsumptionGrams = 30, overrides = {}) {
      const body = { expectedDocumentSnapshotId: snapshotId, signatureImage, expectedConsumptionGrams, expectedContractTemplateId: 3, ...(form === null ? {} : { form }), ...overrides };
      const response = await POST(new Request(`http://localhost/api/signing-sessions/${requestToken}`, {
        method: "POST", body: JSON.stringify(body),
      }), { params: Promise.resolve({ token: requestToken }) });
      return { status: response.status, body: await response.json() };
    },
    async get(query = "", requestToken = token) {
      const response = await GET(new Request(`http://localhost/api/signing-sessions/${requestToken}${query}`), { params: Promise.resolve({ token: requestToken }) });
      return { status: response.status, body: response.headers.get("content-type") === "application/pdf" ? Buffer.from(await response.arrayBuffer()) : await response.json(), headers: response.headers };
    },
  };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
function intact(h) {
  assert.deepEqual(h.members, [original, other], "H: entire Member rows unchanged");
  assert.deepEqual(h.members[0].updatedAt, original.updatedAt, "I: timestamp sentinel unchanged");
  assert.equal(h.calls.memberWrites, 0, "AE: no Member delegate calls");
}
export function committed(h) {
  intact(h);
  const contracts = h.state.contracts.filter(c => c.signingSessionId === 9);
  assert.equal(contracts.length, 1, "P: one contract");
  assert.equal(h.state.session.status, "SIGNED", "Q: session signed");
  assert.equal(h.state.session.signatureImage, signatureImage);
  assert.ok(h.state.session.signedAt instanceof Date);
  assert.equal(h.state.audits.length, 1, "R: one audit");
  assert.deepEqual(h.state.audits[0], {
    actorUserId: null, actorEmail: null, action: "CONTRACT_SIGNED", entityType: "MemberContract",
    entityId: String(contracts[0].id), summary: "Contrato firmado",
    metadata: { memberId: 17, signingSessionId: 9, source: "PUBLIC_SIGNING", monthlyLimitSource: "CLUB_SETTING", monthlyLimitG: contracts[0].consumptionGrams },
  }, "S/AF: exact non-PII audit; no MEMBER_UPDATED");
  return contracts[0];
}
export function rolledBack(h) {
  intact(h);
  assert.deepEqual(h.state, h.initial, "session/signature/date/contract/audit rollback together");
  assert.equal(h.calls.pdf, 0);
}
if (resolve(process.argv[1] ?? "") === resolve(import.meta.filename)) {
for (const [label, form] of [
  ["A", identical], ["B", { ...identical, fullName: different.fullName }],
  ["C", { ...identical, dni: "  x-12.3  " }], ["D", { ...identical, phone: " 222 " }],
  ["E", { ...identical, email: " b@example.com " }], ["F/G", different],
]) await test(`${label}/H/I/J/L/P/Q/R/S: submitted identity with intact Members`, async () => {
  const h = harness(); const response = await h.post(form);
  assert.equal(response.status, 200);
  const contract = committed(h);
  for (const field of ["fullName", "dni", "phone", "email"]) {
    assert.equal(contract[field], field === "dni" ? h.normalize(form[field]) : form[field].trim());
    assert.equal(response.body.member[field], original[field], "public serializer still uses live Member");
  }
  assert.equal(contract.signatureImage, signatureImage);
  assert.deepEqual(h.pdfSources[0], { ...contract, signedPdfUrl: null });
  for (const field of ["fullName", "dni", "phone", "email"]) assert.ok(h.pdfText.includes(contract[field]), `PDF draws contract ${field}`);
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].path, "contracts/member-M17/contract-41.pdf");
  assert.ok(h.uploads[0].size > 0);
});
await test("K/M: omitted form uses Member and previous-contract fallbacks", async () => {
  const h = harness({ previous: true }); assert.equal((await h.post(null)).status, 200);
  const contract = committed(h);
  for (const field of Object.keys(identical)) assert.equal(contract[field], original[field]);
  for (const field of ["address", "birthPlace", "birthDate"]) assert.deepEqual(contract[field], previous[field]);
  assert.equal(contract.consumptionGrams, 30);
  assert.deepEqual(h.state.contracts[0], previous, "previous contract unchanged");
});
for (const field of Object.keys(identical)) await test(`K: omitted ${field}`, async () => {
  const form = { ...different }; delete form[field];
  const h = harness(); assert.equal((await h.post(form)).status, 200);
  assert.equal(committed(h)[field], original[field]);
});
await test("K: empty form without previous contract retains null fallbacks", async () => {
  const h = harness(); assert.equal((await h.post({})).status, 200);
  const contract = committed(h);
  for (const field of ["address", "birthPlace", "birthDate"]) assert.equal(contract[field], null);
  assert.equal(contract.consumptionGrams, 30);
});
await test("N: empty optional values keep identity but clear other contractual fields", async () => {
  const h = harness({ previous: true });
  assert.equal((await h.post({ fullName: "  ", phone: "", email: "  ", address: "", birthPlace: " ", birthDate: "", consumptionGrams: "" })).status, 200);
  const contract = committed(h);
  for (const field of Object.keys(identical)) assert.equal(contract[field], original[field]);
  for (const field of ["address", "birthPlace", "birthDate"]) assert.equal(contract[field], null);
  assert.equal(contract.consumptionGrams, 30);
});
for (const dni of ["", " .- "]) await test("O: explicit empty canonical DNI remains 400", async () => {
  const h = harness(); assert.equal((await h.post({ dni })).status, 400); rolledBack(h);
  assert.equal(h.calls.transactions, 0);
});
for (const error of [new Error("PRIVATE_INFRASTRUCTURE"), unique(["dni"]), unique(["signingSessionId"]), unique("AuditLog_signingSessionId_key"), new Error("SIGNING_SESSION_NOT_PENDING"), "PRIVATE_THROWN_VALUE"]) {
  await test("T/U: audit exceptions including misleading P2002 roll back and return generic 500", async () => {
    const h = harness({ auditError: error }); const response = await h.post(different);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "No se pudo procesar la firma" });
    rolledBack(h); assert.equal(h.calls.rollbacks, 1); assert.equal(h.calls.audits, 1);
    assert.equal(h.calls.globalRecoveries, 0, "audit failure cannot enter unique replay recovery");
  });
}
await test("V/W/X: lost response and different replay payload preserve one contract/audit", async () => {
  const h = harness(); await h.post(different); // Deliberately discard first response.
  const before = h.state;
  assert.equal((await h.post({ dni: "" })).status, 200, "existing contract bypasses payload validation");
  committed(h); assert.deepEqual(h.state, before);
  assert.equal(h.calls.transactions, 1); assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
  assert.equal((await h.get()).body.status, "SIGNED");
});
await test("Y: two pending reads, serialized transaction double, count-zero recovery", async () => {
  const h = harness({ simultaneous: true });
  const responses = await Promise.all([h.post(different), h.post(identical)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const contract = committed(h);
  assert.ok([different.fullName, identical.fullName].includes(contract.fullName));
  assert.equal(h.calls.transactions, 2); assert.equal(h.calls.recoveries, 1);
  assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
});
for (const value of [undefined, "", "  ", "1", 30, "1000", 0, -1, 1001, 1.5, "invalid", null]) {
  await test(`Z: legacy consumptionGrams ignored ${JSON.stringify(value)}`, async () => {
    const h = harness({ previous: true });
    const result = await h.post(value === undefined ? {} : { consumptionGrams: value });
    assert.equal(result.status, 200);
    assert.equal(committed(h).consumptionGrams, 30);
    assert.equal(result.body.member.consumptionGrams, 30);
  });
}
for (const invalid of ["invalid", "b".repeat(48)]) await test("AA: invalid/missing token", async () => {
  const h = harness(); assert.equal((await h.post(different, invalid)).status, 404); rolledBack(h);
});
await test("AB: expired token", async () => {
  const h = harness({ expired: true }); assert.equal((await h.post()).status, 410); rolledBack(h);
});
for (const status of ["CANCELLED", "SIGNED"]) await test(`AC: ${status} without contract`, async () => {
  const h = harness({ status }); assert.equal((await h.post()).status, 409); rolledBack(h);
});
await test("AD: PDF failure after commit preserves signature/contract/audit", async () => {
  const h = harness({ pdfError: true }); assert.equal((await h.post(different)).status, 200);
  assert.equal(committed(h).signedPdfUrl, null); assert.equal(h.calls.rollbacks, 0);
  assert.equal((await h.post()).status, 200); committed(h); assert.equal(h.calls.audits, 1);
});
await test("Unexpected contract errors keep existing framework error boundary", async () => {
  const error = unique(["dni"]); const h = harness({ contractError: error });
  await assert.rejects(h.post(), thrown => thrown === error);
  rolledBack(h); assert.equal(h.calls.audits, 0);
});
await test("SigningSession unique handler remains applicable to contract creation", async () => {
  const error = unique(["signingSessionId"]); const h = harness({ contractError: error });
  await assert.rejects(h.post(), thrown => thrown === error);
  rolledBack(h); assert.equal(h.calls.globalRecoveries, 1);
});
await test("AE/AF: source contains no Member writer, internal HTTP or MEMBER_UPDATED", async () => {
  const source = readFileSync(resolve(root, "app/api/signing-sessions/[token]/route.ts"), "utf8");
  assert.doesNotMatch(source, /\bmember\s*(?:\.|\[)[\s\S]{0,30}(?:update|upsert|create|delete)/);
  assert.doesNotMatch(source, /MEMBER_UPDATED|\bfetch\s*\(|\$executeRaw|\$queryRaw|createAuditLog/);
  assert.equal((source.match(/action: "CONTRACT_SIGNED"/g) ?? []).length, 1);
});
console.log(`${checks} checks passed. A-AF covered with controlled dependencies; no PostgreSQL concurrency or Next.js HTTP-500 rendering claim.`);
}
