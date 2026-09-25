// Real routes, auth guards, PDF rendering, public replay and Sales engine.
// In-memory Prisma/Storage doubles exercise controlled interleavings only.
// No database, network, credentials or real PostgreSQL/Storage concurrency.
// Run: node scripts/test-signed-contract-integrity.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const gate = () => {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
};
const token = "a".repeat(48);
const X = 42;
const signatureImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const original = {
  id: 41, memberId: 17, signingSessionId: 9, contractTemplateId: 3, documentSnapshotId: null,
  fullName: "Contract name", dni: "CONTRACT-DOC", address: "Contract address",
  birthPlace: "Contract birthplace", birthDate: new Date("1990-01-01"),
  phone: "111", email: "contract@example.invalid", consumptionGrams: X,
  signedAt: new Date("2026-09-01"), signatureImage, signedPdfUrl: null,
};
const member = {
  id: 17, memberNumber: "M17", fullName: "Live member name", dni: "LIVE-DOC",
  phone: "222", email: "live@example.invalid", active: true, expiresAt: null,
  commercialProfile: "STANDARD", discountPercent: 0,
};
const template = { id: 3, name: "Original", version: "1", fileUrl: "original-template" };
const document = await PDFDocument.create();
for (let i = 0; i < 3; i++) document.addPage();
const templateBytes = await document.save();
const snapshot = { id: "snapshot-A", bytes: templateBytes, byteLength: templateBytes.length,
  sha256: createHash("sha256").update(templateBytes).digest("hex") };

function loader(mocks) {
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
    vm.runInNewContext(code, {
      exports, require: load, console, Response, Request, URL, Buffer, Error, SyntaxError, Date,
    }, { filename });
    return exports;
  }
  return load;
}

function harness(options = {}) {
  const state = {
    contract: options.missing ? null : { ...copy(original), ...copy(options.contract ?? {}) },
    session: { id: 9, token, memberId: 17, status: "SIGNED", signatureImage,
      signedAt: new Date("2026-09-01"), expiresAt: new Date(Date.now() + 3600_000) },
    audits: [{ action: "CONTRACT_SIGNED", entityType: "MemberContract", entityId: "41",
      metadata: { monthlyLimitSource: "CLUB_SETTING", monthlyLimitG: X } }],
  };
  const initial = copy(state);
  const calls = { reads: 0, writes: 0, uploads: 0, downloads: 0, renders: 0, urls: 0, publications: 0, snapshotReads: 0 };
  const loadedBytes = [];
  const signatureEmbeds = [], signatureDraws = [];
  const objects = new Map(), draws = [], urlRefs = [], updateInputs = [];
  const failWriter = () => { calls.writes++; throw new Error("Unexpected writer"); };
  const prisma = {
    contractDocumentSnapshot: { async findUnique({ where }) {
      calls.snapshotReads++;
      assert.equal(where.id, "snapshot-A");
      if (options.snapshotReadError) throw new Error("PRIVATE_SNAPSHOT_SQL");
      return copy(options.snapshot === undefined ? snapshot : options.snapshot);
    } },
    contractTemplate: { async findUnique({ where }) { assert.equal(where.id, 3); return copy(template); } },
    appUser: { async findUnique() {
      if (options.authError) throw new Error("PRIVATE_AUTH_SQL");
      return { id: 1, role: options.role ?? "ADMIN", active: options.active ?? true, name: "Operator", email: null };
    } },
    member: { update: failWriter, updateMany: failWriter },
    auditLog: { create: failWriter },
    signingSession: {
      async findUnique() { return copy({ ...state.session, member, contract: state.contract }); },
      update: failWriter, updateMany: failWriter,
    },
    memberContract: {
      async findUnique({ where, include }) {
        calls.reads++;
        if (options.readError) throw new Error("PRIVATE_DB_SQL");
        if (!state.contract || where.id !== state.contract.id) return null;
        const result = copy(state.contract);
        if (include?.member) result.member = { ...member,
          memberNumber: options.differentPaths ? `M${calls.reads}` : member.memberNumber };
        if (include?.contractTemplate) result.contractTemplate = options.missingTemplate ? null : { ...copy(template), ...copy(options.template ?? {}) };
        return result;
      },
      async update({ where, data }) {
        calls.writes++;
        updateInputs.push(plain({ where, data }));
        assert.deepEqual(plain(where), { id: 41, signedPdfUrl: null });
        assert.deepEqual(Object.keys(data), ["signedPdfUrl"], "only artifact publication may write");
        await options.beforeUpdate?.(calls.writes);
        if (options.updateError) throw new Error("PRIVATE_UPDATE_SQL");
        if (options.casMiss || state.contract?.signedPdfUrl !== null) {
          throw new Prisma.PrismaClientKnownRequestError("PRIVATE_CAS_SQL", { code: "P2025", clientVersion: "7.8.0" });
        }
        Object.assign(state.contract, copy(data));
        calls.publications++;
        return copy(state.contract);
      },
      create: failWriter, updateMany: failWriter, delete: failWriter,
    },
  };
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.noSession ? null : ({ user: { id: "1", role: "ADMIN" } }) },
    "@/lib/auth": { authConfig: {} },
    "@/lib/prisma": { prisma },
    "@/lib/storage": { isStorageUrlsDisabled: () => options.disabled ?? false },
    "@/lib/contract-templates": {
      findActiveContractTemplate: async () => { throw new Error("Active-template fallback forbidden"); },
      // Used only by the unchanged public serializer, never by the PDF generator.
      resolveContractTemplateForContract: async id => { assert.equal(id, 3); return template; },
    },
    "@/lib/contract-storage": {
      async createSignedUrlForAllowedStorageRef(ref) {
        calls.urls++; urlRefs.push(ref);
        if (options.urlError) throw new Error("PRIVATE_URL_TOKEN");
        // Simulate the resolver returning null after Storage reports a missing object.
        if (options.publishedObjectMissing && ref === "published") return null;
        return ref ? `https://storage.invalid/${encodeURIComponent(ref)}` : null;
      },
      async downloadAllowedStorageObject(ref) {
        calls.downloads++;
        assert.equal(ref, template.fileUrl);
        if (options.downloadError) throw new Error("PRIVATE_TEMPLATE_URL");
        return { bytes: templateBytes };
      },
      serializeAllowedStorageRef: ref => JSON.stringify(ref),
    },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from(bucket) {
      assert.equal(bucket, "signed-contracts");
      return { async upload(path, bytes, settings) {
        const attempt = ++calls.uploads;
        assert.equal(settings.upsert, false, "Storage must reject replacement");
        assert.equal(settings.contentType, "application/pdf");
        await options.beforeUpload?.(attempt, path);
        if (options.uploadThrows) throw new Error("PRIVATE_STORAGE_URL");
        if (options.uploadError || objects.has(path)) return { error: { message: "PRIVATE_STORAGE_ERROR" } };
        objects.set(path, Buffer.from(bytes));
        await options.afterUpload?.(attempt, path);
        return { error: null };
      } };
    } } }) },
    "pdf-lib": {
      ...require("pdf-lib"),
      PDFDocument: { async load(bytes, settings) {
        calls.renders++;
        loadedBytes.push(Buffer.from(bytes));
        const doc = await PDFDocument.load(bytes, settings);
        const embed = doc.embedPng.bind(doc);
        doc.embedPng = async bytes => {
          const image = await embed(bytes);
          signatureEmbeds.push({ bytes: Buffer.from(bytes), image });
          return image;
        };
        for (const page of doc.getPages()) {
          const drawImage = page.drawImage.bind(page);
          page.drawImage = (image, settings) => {
            signatureDraws.push({ image, page: doc.getPages().indexOf(page) });
            return drawImage(image, settings);
          };
          const draw = page.drawText.bind(page);
          page.drawText = (text, settings) => { draws.push(text); return draw(text, settings); };
        }
        return doc;
      } },
    },
  };
  const load = loader(mocks);
  const pdf = load("@/lib/contract-pdf");
  const patch = load("@/app/api/contracts/[id]/route").PATCH;
  const getPdf = load("@/app/api/contracts/[id]/pdf/route").GET;
  const replay = load("@/app/api/signing-sessions/[token]/route").POST;
  return {
    state, initial, calls, objects, draws, signatureEmbeds, signatureDraws, urlRefs, updateInputs, pdf, options, load, loadedBytes,
    patch(body = { consumptionGrams: 60 }, id = "41", raw = false) {
      return patch(new Request("http://test/api/contracts/41", { method: "PATCH", body: raw ? body : JSON.stringify(body) }),
        { params: Promise.resolve({ id }) });
    },
    get(force = false, id = "41") {
      return getPdf(new Request(`http://test/api/contracts/${id}/pdf${force ? "?force=true" : ""}`), { params: Promise.resolve({ id }) });
    },
    replay() {
      return replay(new Request(`http://test/api/signing-sessions/${token}`, { method: "POST", body: "ignored replay body" }),
        { params: Promise.resolve({ token }) });
    },
  };
}

let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function responseIs(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  if (code) assert.equal(body.code, code);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|CONTRACT-DOC|contract@example|data:image|stack|Prisma/);
  return body;
}
function untouched(h) { assert.deepEqual(h.state, h.initial); assert.equal(h.calls.writes, 0); }
function snapshotIntact(h) {
  assert.deepEqual({ ...h.state.contract, signedPdfUrl: null }, { ...h.initial.contract, signedPdfUrl: null });
  assert.deepEqual(h.state.audits, h.initial.audits);
  assert.deepEqual(h.state.session, h.initial.session);
}

for (const [label, value] of [["A", 60], ["B", null], ["same-value", X]]) {
  await test(`${label}/I: ADMIN PATCH immutable`, async () => {
    const h = harness();
    const body = await responseIs(await h.patch({ consumptionGrams: value }), 409, "SIGNED_CONTRACT_IMMUTABLE");
    assert.equal(body.error, "El contrato firmado no puede modificarse. Se requiere una nueva firma.");
    untouched(h);
  });
}
for (const [label, options, status] of [["C", { role: "STAFF" }, 403], ["D", { noSession: true }, 401],
  ["disabled", { active: false }, 401], ["other-role", { role: "OTHER" }, 403]]) {
  await test(`${label}: persisted auth`, async () => { const h = harness(options); await responseIs(await h.patch(), status); untouched(h); });
}
await test("E: missing contract", async () => { const h = harness({ missing: true }); await responseIs(await h.patch(), 404, "CONTRACT_NOT_FOUND"); untouched(h); });
for (const id of ["0", "-1", "1.5", "abc", "", "01", "1e2", "2147483648", "9007199254740992"]) {
  await test(`F: invalid id ${id}`, async () => { const h = harness(); await responseIs(await h.patch(undefined, id), 400); untouched(h); });
}
await test("G: invalid JSON", async () => { const h = harness(); await responseIs(await h.patch("{", "41", true), 400); untouched(h); });
for (const payload of [{}, null, [], { consumptionGrams: "42" }, { consumptionGrams: 0 }, { consumptionGrams: -1 },
  { consumptionGrams: 1.5 }, { consumptionGrams: 2147483648 },
  ...["fullName", "dni", "address", "birthPlace", "birthDate", "phone", "email", "signatureImage", "signedPdfUrl", "contractTemplateId", "signedAt", "extra"]
    .map(field => ({ consumptionGrams: X, [field]: "forbidden" }))]) {
  await test(`H: strict payload ${Object.keys(payload ?? {}).join(",")}`, async () => {
    const h = harness(); await responseIs(await h.patch(payload), 400); untouched(h);
  });
}
for (const options of [{ readError: true }, { authError: true }]) {
  await test("infrastructure: generic PATCH 500", async () => { const h = harness(options); await responseIs(await h.patch(), 500); untouched(h); });
}
await test("legacy row without session, template or signature stays immutable", async () => {
  const h = harness({ contract: { signingSessionId: null, contractTemplateId: null, signatureImage: "" } });
  await responseIs(await h.patch(), 409, "SIGNED_CONTRACT_IMMUTABLE"); untouched(h);
});
await test("two simultaneous PATCH requests never write", async () => {
  const h = harness();
  for (const response of await Promise.all([h.patch(), h.patch({ consumptionGrams: null })])) await responseIs(response, 409);
  untouched(h);
});

await test("J: actual Sales keeps enforcing X after rejected Y and null", async () => {
  const h = harness();
  await responseIs(await h.patch(), 409); await responseIs(await h.patch({ consumptionGrams: null }), 409);
  const reached = new Error("stock write boundary");
  let accumulated = X, reads = 0;
  const tx = {
    dayClosure: { findUnique: async () => null },
    member: { findUnique: async () => member },
    memberContract: { findFirst: async ({ where, orderBy }) => {
      assert.equal(where.memberId, 17); assert.equal(orderBy.signedAt, "desc"); reads++; return copy(h.state.contract);
    } },
    product: {
      findMany: async () => [{ id: 1, name: "Test", unit: "G", active: true, stock: 100, price: 1, averageCost: 0 }],
      updateMany: async () => { throw reached; },
    },
    sale: { findMany: async ({ where }) => where.createdAt.lt ? [{ qty: accumulated, product: { unit: "G" } }] : [] },
  };
  const engine = loader({
    "@/lib/prisma": { prisma: { $transaction: async fn => fn(tx) } },
    "@/lib/club-settings": { getClubSettings: async () => ({ dailyLimitG: 10, dailyLimitUd: 15 }) },
    "@/lib/audit": { createAuditLog: async () => assert.fail("unexpected audit") },
  })("@/lib/sales-engine");
  const input = { memberId: 17, operatorUserId: 1, operationType: "SINGLE", items: [{ productId: 1, qty: 1 }] };
  await assert.rejects(engine.createSaleTransaction(input), error => error instanceof engine.SaleValidationError && error.message.includes(`(${X} g)`));
  accumulated = X - 1;
  await assert.rejects(engine.createSaleTransaction(input), error => error === reached);
  assert.equal(reads, 2); untouched(h);
});

await test("K/M/N/O: existing PDF reused without rendering, upload or update", async () => {
  const h = harness({ contract: { signedPdfUrl: "published", contractTemplateId: null }, missingTemplate: true });
  assert.equal((await h.get()).status, 302);
  assert.equal(h.calls.renders + h.calls.uploads + h.calls.downloads, 0);
  assert.deepEqual(h.urlRefs, ["published"]); untouched(h);
});
await test("L/Z: HTTP and direct helper force cannot replace published PDF", async () => {
  const h = harness({ contract: { signedPdfUrl: "published" } });
  const body = await responseIs(await h.get(true), 409, "SIGNED_PDF_IMMUTABLE");
  assert.equal(body.error, "El PDF firmado existente no puede sustituirse.");
  await assert.rejects(h.pdf.ensureSignedContractPdf(41, { force: true }), error => error.code === "SIGNED_PDF_IMMUTABLE");
  assert.equal(h.calls.uploads + h.calls.renders, 0); untouched(h);
});
await test("review G: published reference with missing Storage object never regenerates", async () => {
  const h = harness({ contract: { signedPdfUrl: "published" }, publishedObjectMissing: true });
  await assert.rejects(h.pdf.ensureSignedContractPdf(41), { message: "No se pudo obtener el PDF firmado" });
  await responseIs(await h.get(), 500);
  // Replay acknowledges the persisted signature, not successful PDF retrieval.
  const replay = await responseIs(await h.replay(), 200);
  assert.equal(replay.status, "SIGNED");
  assert.equal(Object.hasOwn(replay, "signedPdfUrl"), false);
  await responseIs(await h.get(true), 409, "SIGNED_PDF_IMMUTABLE");
  await assert.rejects(h.pdf.ensureSignedContractPdf(41, { force: true }), error => error.code === "SIGNED_PDF_IMMUTABLE");
  assert.equal(h.calls.renders + h.calls.downloads + h.calls.uploads, 0);
  untouched(h);
});
for (const force of [false, true]) await test(`P/R/S/T/U: initial PDF snapshot, force=${force}`, async () => {
  const h = harness(); assert.equal((await h.get(force)).status, 302);
  assert.equal(h.calls.uploads, 1); assert.equal(h.calls.publications, 1);
  assert.ok(h.draws.includes(String(X)));
  for (const field of ["fullName", "dni", "phone", "email", "address", "birthPlace"]) assert.ok(h.draws.includes(original[field]));
  assert.ok(!h.draws.includes(member.fullName)); assert.ok(!h.draws.includes(member.dni));
  const bytes = [...h.objects.values()][0]; assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3);
  assert.equal(h.signatureEmbeds.length, 1);
  assert.deepEqual(h.signatureEmbeds[0].bytes, Buffer.from(original.signatureImage.split(",")[1], "base64"));
  assert.deepEqual(h.signatureDraws.map(draw => draw.page), [1, 1, 2, 2]);
  for (const draw of h.signatureDraws) assert.equal(draw.image, h.signatureEmbeds[0].image);
  assert.ok(h.state.contract.signedPdfUrl); snapshotIntact(h);
});
for (const options of [{ contract: { contractTemplateId: null } }, { missingTemplate: true }, { contract: { contractTemplateId: 8 } }]) {
  await test("Q: absent or inconsistent original template never uses active template", async () => {
    const h = harness(options);
    const body = await responseIs(await h.get(), 409, "CONTRACT_TEMPLATE_UNRESOLVED");
    assert.equal(body.error, "No se puede determinar de forma segura la plantilla original del contrato.");
    assert.equal(h.calls.uploads + h.calls.downloads, 0); untouched(h);
  });
}
await test("V: real public replay with PDF is read-only", async () => {
  const h = harness({ contract: { signedPdfUrl: "published" } });
  await responseIs(await h.replay(), 200); assert.equal(h.calls.uploads + h.calls.renders, 0); untouched(h);
});
await test("W: real replay materializes initial PDF once", async () => {
  const h = harness(); await responseIs(await h.replay(), 200); snapshotIntact(h);
  const after = copy(h.state);
  await responseIs(await h.replay(), 200);
  assert.equal(h.calls.uploads, 1); assert.equal(h.calls.writes, 1); assert.deepEqual(h.state, after);
});
for (const options of [{ uploadError: true }, { uploadThrows: true }, { downloadError: true }]) {
  await test("X: Storage failure leaves contract, signature and audit intact", async () => {
    const h = harness(options); await responseIs(await h.get(), 500); untouched(h);
    await responseIs(await h.replay(), 200); untouched(h);
  });
}
await test("URL failure after publication can retry without regeneration", async () => {
  const h = harness({ urlError: true }); await responseIs(await h.get(), 500);
  assert.equal(h.signatureEmbeds.length, 1);
  assert.deepEqual(h.signatureEmbeds[0].bytes, Buffer.from(original.signatureImage.split(",")[1], "base64"));
  assert.deepEqual(h.signatureDraws.map(draw => draw.page), [1, 1, 2, 2]);
  for (const draw of h.signatureDraws) assert.equal(draw.image, h.signatureEmbeds[0].image);
  assert.ok(h.state.contract.signedPdfUrl); snapshotIntact(h);
  h.options.urlError = false; assert.equal((await h.get()).status, 302);
  assert.equal(h.calls.uploads, 1); assert.equal(h.calls.writes, 1);
});
await test("existing object without DB publication is neither adopted nor overwritten", async () => {
  const h = harness(); const path = "contracts/member-M17/contract-41.pdf";
  h.objects.set(path, Buffer.from("unknown previous artifact"));
  await responseIs(await h.get(), 500); untouched(h);
  assert.equal(h.objects.get(path).toString(), "unknown previous artifact");
});
await test("DB failure after upload cannot cause a later overwrite or implicit adoption", async () => {
  const h = harness({ updateError: true }); await responseIs(await h.get(), 500);
  assert.deepEqual(h.state, h.initial);
  const before = Buffer.from([...h.objects.values()][0]);
  h.options.updateError = false; await responseIs(await h.get(), 500);
  assert.deepEqual([...h.objects.values()][0], before); assert.deepEqual(h.state, h.initial);
});

await test("Y: late same-path upload cannot replace winning publication", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ beforeUpload: async attempt => { if (attempt === 1) { entered.release(); await resume.promise; } } });
  const late = h.get(); await entered.promise;
  assert.equal((await h.get()).status, 302);
  const winner = copy(h.state); const bytes = Buffer.from([...h.objects.values()][0]);
  resume.release(); assert.equal((await late).status, 302);
  assert.deepEqual(h.state, winner); assert.deepEqual([...h.objects.values()][0], bytes);
  assert.equal(h.calls.publications, 1); snapshotIntact(h);
});
await test("Y: CAS protects reference even when concurrent uploads use different paths", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ differentPaths: true, beforeUpdate: async attempt => { if (attempt === 1) { entered.release(); await resume.promise; } } });
  const late = h.get(); await entered.promise;
  const winnerResponse = await h.get(); assert.equal(winnerResponse.status, 302);
  const winner = copy(h.state); resume.release();
  const lateResponse = await late; assert.equal(lateResponse.status, 302);
  assert.equal(lateResponse.headers.get("location"), winnerResponse.headers.get("location"));
  assert.deepEqual(h.state, winner); assert.equal(h.calls.publications, 1); assert.equal(h.objects.size, 2);
  snapshotIntact(h);
});
await test("review F: P2025 with DB still null fails closed after reread", async () => {
  // Fault injection for the defensive branch, not a claim that this interleaving
  // normally occurs in PostgreSQL with the current writers.
  const h = harness({ casMiss: true });
  await responseIs(await h.get(), 500);
  assert.equal(h.calls.uploads, 1);
  assert.equal(h.calls.writes, 1);
  assert.equal(h.calls.reads, 2, "P2025 must reread the authoritative DB row");
  assert.equal(h.calls.publications, 0);
  assert.equal(h.calls.urls, 0, "never sign the unpublished upload's URL");
  assert.equal(h.objects.size, 1, "unpublished object remains untouched");
  assert.deepEqual(h.state, h.initial);
});
await test("GET/replay during upload fail safely until publication, then reuse winner", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ afterUpload: async attempt => { if (attempt === 1) { entered.release(); await resume.promise; } } });
  const first = h.get(); await entered.promise;
  await responseIs(await h.get(), 500); await responseIs(await h.replay(), 200);
  assert.equal(h.state.contract.signedPdfUrl, null);
  resume.release(); assert.equal((await first).status, 302);
  const uploads = h.calls.uploads;
  assert.equal((await h.get()).status, 302); await responseIs(await h.replay(), 200);
  assert.equal(h.calls.uploads, uploads); assert.equal(h.calls.publications, 1); snapshotIntact(h);
});
await test("PATCH during generation cannot change the rendered snapshot", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ beforeUpload: async () => { entered.release(); await resume.promise; } });
  const first = h.get(); await entered.promise;
  await responseIs(await h.patch(), 409); await responseIs(await h.patch({ consumptionGrams: null }), 409); untouched(h);
  resume.release(); assert.equal((await first).status, 302); snapshotIntact(h);
});
await test("force loses a publication race with controlled 409", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ beforeUpload: async attempt => { if (attempt === 1) { entered.release(); await resume.promise; } } });
  const late = h.get(true); await entered.promise;
  assert.equal((await h.get()).status, 302); const winner = copy(h.state);
  resume.release(); await responseIs(await late, 409, "SIGNED_PDF_IMMUTABLE"); assert.deepEqual(h.state, winner);
});
for (const [options, id, force, status] of [[{ missing: true }, "41", false, 404], [{}, "bad", false, 400],
  [{ role: "STAFF" }, "41", true, 403], [{ noSession: true }, "41", false, 401],
  [{ active: false }, "41", false, 401], [{ disabled: true }, "41", false, 503], [{ authError: true }, "41", false, 500]]) {
  await test(`PDF controlled auth/validation/infrastructure ${status}`, async () => {
    const h = harness(options); await responseIs(await h.get(force, id), status); untouched(h);
  });
}
await test("member UI offers initial generation or existing PDF, never contract editing", async () => {
  const source = readFileSync(resolve(root, "app/members/[id]/page.tsx"), "utf8");
  assert.doesNotMatch(source, /updateContractMonthlyLimit|savingContractId|Regenerar PDF|force=true/);
  assert.match(source, /contract\.signedPdfUrl \? "Ver contrato firmado" : "Generar PDF firmado"/);
  assert.match(source, /se requiere una nueva firma/);
});
const provenance = { contract: { documentSnapshotId: "snapshot-A" }, template: { documentSnapshotId: "snapshot-A", fileUrl: "changed-to-B" } };
for (const deleted of [false, true]) await test(`snapshot A is exact base despite changed/deleted Storage (${deleted})`, async () => {
  const h = harness({ ...provenance, downloadError: deleted });
  assert.equal((await h.get()).status, 302);
  assert.equal(h.calls.downloads, 0);
  assert.equal(h.calls.snapshotReads, 1);
  assert.equal(h.loadedBytes.length, 2, "production verification then production rendering");
  for (const bytes of h.loadedBytes) assert.deepEqual(bytes, Buffer.from(templateBytes));
  assert.equal(h.signatureEmbeds.length, 1);
  assert.deepEqual(h.signatureEmbeds[0].bytes, Buffer.from(signatureImage.split(",")[1], "base64"));
  assert.deepEqual(h.signatureDraws.map(draw => draw.page), [1, 1, 2, 2]);
  snapshotIntact(h);
});
const invalidPdf = Buffer.from("not a PDF");
for (const bad of [null, { ...snapshot, bytes: new Uint8Array() },
  { ...snapshot, sha256: "0".repeat(64) }, { ...snapshot, byteLength: snapshot.byteLength + 1 },
  { ...snapshot, bytes: invalidPdf, byteLength: invalidPdf.length, sha256: createHash("sha256").update(invalidPdf).digest("hex") },
  { ...snapshot, id: "different-snapshot" }]) await test("missing/corrupt/hash/length/PDF/ID fails closed without fallback", async () => {
    const h = harness({ ...provenance, snapshot: bad });
    await responseIs(await h.get(), 409, "CONTRACT_DOCUMENT_UNAVAILABLE");
    assert.equal(h.calls.uploads + h.calls.downloads, 0); untouched(h);
  });
for (const overrides of [
  { template: { documentSnapshotId: "snapshot-B" } }, { template: { documentSnapshotId: null } },
  { contract: { documentSnapshotId: "snapshot-A", contractTemplateId: 8 } }, { missingTemplate: true },
]) await test("contract/template/snapshot mismatch cannot publish", async () => {
  const h = harness({ ...provenance, ...overrides });
  await responseIs(await h.get(), 409);
  assert.equal(h.calls.uploads + h.calls.downloads, 0); untouched(h);
});
await test("published snapshot contract and replay never read unavailable snapshot", async () => {
  const h = harness({ ...provenance, contract: { documentSnapshotId: "snapshot-A", signedPdfUrl: "published" }, snapshotReadError: true });
  assert.equal((await h.get()).status, 302); await responseIs(await h.replay(), 200);
  assert.equal(h.calls.snapshotReads + h.calls.downloads + h.calls.uploads, 0); untouched(h);
});
await test("snapshot contract concurrent CAS preserves winner", async () => {
  const entered = gate(), resume = gate();
  const h = harness({ ...provenance, differentPaths: true, beforeUpdate: async attempt => {
    if (attempt === 1) { entered.release(); await resume.promise; }
  } });
  const late = h.get(); await entered.promise;
  const winner = await h.get(); resume.release(); const loser = await late;
  assert.equal(winner.status, 302); assert.equal(loser.status, 302);
  assert.equal(winner.headers.get("location"), loser.headers.get("location"));
  assert.equal(h.calls.publications, 1); assert.equal(h.calls.downloads, 0); snapshotIntact(h);
});
await test("legacy null uses bound fileUrl without inferring template snapshot", async () => {
  const h = harness({ template: { documentSnapshotId: "snapshot-A" }, snapshotReadError: true });
  assert.equal((await h.get()).status, 302);
  assert.equal(h.calls.downloads, 1); assert.equal(h.calls.snapshotReads, 0);
  assert.equal(h.state.contract.documentSnapshotId, null); snapshotIntact(h);
});
console.log(`${checks} checks passed. A-Z plus snapshot and controlled race/failure cases; no real PostgreSQL/Storage concurrency or browser claim.`);
