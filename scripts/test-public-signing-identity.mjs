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
function loader(mocks) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, name.slice(2) + ".ts");
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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
  id: 40, memberId: original.id, signingSessionId: null, contractTemplateId: 3,
  ...identical, address: "Previous address", birthPlace: "Previous place",
  birthDate: new Date("1990-01-01"), consumptionGrams: 37,
  signatureImage, signedAt: new Date("2025-01-01"), signedPdfUrl: null,
};
const template = { id: 3, name: "Template", version: "1", fileUrl: "template-ref" };
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const templateDocument = await PDFDocument.create();
for (let i = 0; i < 3; i++) templateDocument.addPage();
const templateBytes = await templateDocument.save();

function harness(options = {}) {
  const members = copy([original, other]);
  let state = {
    session: {
      id: 9, token, memberId: original.id, status: options.status ?? "PENDING",
      expiresAt: new Date(Date.now() + (options.expired ? -60_000 : 3600_000)),
      signatureImage: null, signedAt: null, createdAt: new Date(),
    },
    contracts: options.previous ? [copy(previous)] : [], audits: [],
  };
  const initial = copy(state);
  const calls = { transactions: 0, rollbacks: 0, memberWrites: 0, creates: 0, audits: 0, recoveries: 0, globalRecoveries: 0, pdf: 0, pdfUpdates: 0 };
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
    member: memberDelegate,
    signingSession: { async findUnique({ where }) {
      if (where.token !== token) return null;
      const snapshot = copy({ ...state.session, member: members[0], contract: state.contracts.find(c => c.signingSessionId === state.session.id) ?? null });
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
      const staged = copy(state);
      const tx = {
        member: memberDelegate,
        signingSession: { async updateMany({ where, data }) {
          assert.deepEqual(plain(where), { id: 9, status: "PENDING" });
          if (staged.session.status !== where.status) return { count: 0 };
          Object.assign(staged.session, copy(data));
          return { count: 1 };
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
    "@/lib/contract-templates": { findActiveContractTemplate: async () => template, resolveContractTemplateForContract: async () => template },
    "@/lib/club-settings": { getClubSettings: async () => ({ defaultMonthlyLimitG: 30 }) },
    "@/lib/storage": { isStorageUrlsDisabled: () => false },
    "@/lib/contract-storage": {
      createSignedUrlForAllowedStorageRef: async ref => ref ? "https://storage.invalid/controlled" : null,
      downloadAllowedStorageObject: async () => ({ bytes: templateBytes }),
      serializeAllowedStorageRef: ref => JSON.stringify(ref),
    },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from(bucket) {
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
    get members() { return copy(members); }, get state() { return copy(state); },
    normalize: load("@/lib/member-identity").normalizeMemberIdentity,
    async post(form = identical, requestToken = token) {
      const body = { signatureImage, ...(form === null ? {} : { form }) };
      const response = await POST(new Request(`http://localhost/api/signing-sessions/${requestToken}`, {
        method: "POST", body: JSON.stringify(body),
      }), { params: Promise.resolve({ token: requestToken }) });
      return { status: response.status, body: await response.json() };
    },
    async get() {
      const response = await GET(new Request(`http://localhost/api/signing-sessions/${token}`), { params: Promise.resolve({ token }) });
      return { status: response.status, body: await response.json() };
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
function committed(h) {
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
    metadata: { memberId: 17, signingSessionId: 9, source: "PUBLIC_SIGNING" },
  }, "S/AF: exact non-PII audit; no MEMBER_UPDATED");
  return contracts[0];
}
function rolledBack(h) {
  intact(h);
  assert.deepEqual(h.state, h.initial, "session/signature/date/contract/audit rollback together");
  assert.equal(h.calls.pdf, 0);
}
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
  for (const field of ["address", "birthPlace", "birthDate", "consumptionGrams"]) assert.deepEqual(contract[field], previous[field]);
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
  for (const field of ["address", "birthPlace", "birthDate", "consumptionGrams"]) assert.equal(contract[field], null);
});
await test("N: empty optional values keep identity but clear other contractual fields", async () => {
  const h = harness({ previous: true });
  assert.equal((await h.post({ fullName: "  ", phone: "", email: "  ", address: "", birthPlace: " ", birthDate: "", consumptionGrams: "" })).status, 200);
  const contract = committed(h);
  for (const field of Object.keys(identical)) assert.equal(contract[field], original[field]);
  for (const field of ["address", "birthPlace", "birthDate", "consumptionGrams"]) assert.equal(contract[field], null);
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
  await test(`Z: unchanged consumptionGrams ${JSON.stringify(value)}`, async () => {
    const h = harness({ previous: true });
    const expected = value === undefined ? 37 : typeof value === "string" && !value.trim() ? null : Number(value);
    const valid = value !== null && (expected === null || (Number.isInteger(expected) && expected > 0 && expected <= 1000));
    const result = await h.post(value === undefined ? {} : { consumptionGrams: value });
    assert.equal(result.status, valid ? 200 : 400);
    if (valid) {
      assert.equal(committed(h).consumptionGrams, expected);
      assert.equal(result.body.member.consumptionGrams, expected);
    } else rolledBack(h);
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
