// Real routes/auth; in-memory Prisma and Storage doubles. No database/network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const signatureImage = "data:image/png;base64,PRIVATE_SIGNATURE_BYTES";
const template = { id: 3, name: "Original", version: "1", active: true,
  createdAt: "2026-09-01T00:00:00.000Z", fileUrl: "private-template" };
const contract = { id: 41, memberId: 17, signingSessionId: 9, contractTemplateId: 3,
  fullName: "Contract name", dni: "DOC", address: "Address", birthPlace: "Place",
  birthDate: "1990-01-01T00:00:00.000Z", phone: "111", email: "test@example.invalid",
  consumptionGrams: 42, signedAt: "2026-09-01T00:00:00.000Z", signedPdfUrl: "private-pdf" };
const member = { id: 17, fullName: "Member", dni: "DOC", photoUrl: null, dniFrontUrl: null, dniBackUrl: null };
function harness(options = {}) {
  let reads = 0;
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "1", role: "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/contract-storage": { createSignedUrlForAllowedStorageRef: async ref => ref ? "https://storage.invalid/pdf" : null },
    "@/lib/storage": { resolveStorageUrlForResponse: async () => null },
    "@/lib/prisma": { prisma: {
      appUser: { findUnique: async () => ({ id: 1, active: options.active ?? true, role: options.role ?? "STAFF" }) },
      memberContract: { findMany: async query => {
        reads++;
        assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { memberId: 17 });
        assert.deepEqual(JSON.parse(JSON.stringify(query.orderBy)), { signedAt: "desc" });
        assert.ok(query.select && !query.select.signatureImage, "query excludes raw signature");
        // Deliberately return extra sensitive fields: DTO must also be an allowlist.
        return options.empty ? [] : [{ ...contract, signatureImage, futureSignature: signatureImage,
          ...(options.legacy ? { signedPdfUrl: null, contractTemplateId: null, signingSessionId: null } : {}),
          contractTemplate: options.legacy ? null : template }];
      } },
      member: { findUnique: async () => { reads++; return member; } },
      sale: { findMany: async () => [] },
    } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, name.slice(2) + ".ts");
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, require: load, Response, Request, console }, { filename });
    return exports;
  }
  return {
    get: route => load(`@/app/api/members/[id]/${route}/route`).GET(
      new Request(`http://test/api/members/17/${route}`), { params: Promise.resolve({ id: "17" }) }),
    reads: () => reads,
  };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function safeBody(response) {
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /signatureImage|PRIVATE_SIGNATURE_BYTES|data:image/);
  return JSON.parse(text);
}
for (const role of ["STAFF", "ADMIN"]) {
  await test(`${role}: contractual metadata preserved without signature`, async () => {
    const body = await safeBody(await harness({ role }).get("contracts"));
    assert.equal(Object.hasOwn(body[0], "signatureImage"), false);
    assert.deepEqual(body, [{ ...contract, signedPdfUrl: "https://storage.invalid/pdf",
      contractTemplate: { ...template, fileUrl: null } }]);
  });
  await test(`${role}: history remains free of signature`, async () => {
    assert.deepEqual(await safeBody(await harness({ role }).get("history")), {
      member, sales: [], totalSpent: 0, count: 0,
    });
  });
}
for (const [options, status] of [[{ noSession: true }, 401], [{ active: false }, 401], [{ role: "OTHER" }, 403]]) {
  await test(`contracts rejects ${JSON.stringify(options)}`, async () => {
    const h = harness(options), response = await h.get("contracts");
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
    assert.equal(h.reads(), 0);
  });
}
await test("empty and legacy contracts preserve HTTP shape", async () => {
  assert.deepEqual(await safeBody(await harness({ empty: true }).get("contracts")), []);
  assert.deepEqual(await safeBody(await harness({ legacy: true }).get("contracts")), [{
    ...contract, signingSessionId: null, contractTemplateId: null, signedPdfUrl: null, contractTemplate: null,
  }]);
});
console.log(`${checks} contract minimization checks passed`);
