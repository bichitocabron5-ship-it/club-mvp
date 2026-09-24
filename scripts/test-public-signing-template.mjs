// Production routes, serializer, Storage availability helper and PDF renderer.
// In-memory Prisma/Storage and simulated React hooks; not PostgreSQL/browser concurrency.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { harness, loader } from "./test-public-signing-identity.mjs";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const deferred = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };
const contract = h => h.state.contracts.find(c => c.signingSessionId === 9);
const untouched = h => { assert.equal(h.calls.creates, 0); assert.equal(h.calls.audits, 0); assert.equal(h.state.session.status, "PENDING"); };

await test("status polling never downloads templates or creates URLs, even during Storage failure", async () => {
  let downloads = 0, urls = 0;
  const options = {
    beforeDocumentRead: () => { downloads++; throw new Error("Storage outage"); },
    onSignedUrl: () => { urls++; throw new Error("Storage outage"); },
  };
  const h = harness(options);
  h.setSettingsError(new Error("Status must not read monthly settings"));
  for (let i = 0; i < 10; i++) {
    const r = await h.get("?mode=status");
    assert.equal(r.status, 200); assert.deepEqual(r.body, { status: "PENDING" });
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  assert.equal(downloads, 0); assert.equal(urls, 0); untouched(h);
  // Status success provides no document and cannot authorize a new signature.
  assert.equal((await h.get()).status, 503);
  assert.equal((await h.post()).status, 503);
  assert.equal(downloads, 2); assert.equal(urls, 0); untouched(h);
});
await test("status recognizes signed contracts without Storage; replay remains idempotent", async () => {
  let downloads = 0, urls = 0;
  const options = { beforeDocumentRead: () => { downloads++; }, onSignedUrl: () => { urls++; } };
  const h = harness(options); assert.equal((await h.post()).status, 200);
  const before = { downloads, urls };
  options.objectMissing = true; options.urlMissing = true;
  for (let i = 0; i < 5; i++) {
    const r = await h.get("?mode=status");
    assert.equal(r.status, 200); assert.deepEqual(r.body, { status: "SIGNED" });
  }
  assert.deepEqual({ downloads, urls }, before);
  assert.equal((await h.post()).status, 200);
  assert.equal(downloads, before.downloads);
  assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
});
await test("status is observation only for unresolved legacy sessions; signing stays fail-closed", async () => {
  const h = harness({ templateId: null });
  assert.deepEqual((await h.get("?mode=status")).body, { status: "PENDING" });
  for (const r of [await h.get(), await h.post()]) {
    assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_TEMPLATE_UNRESOLVED");
  }
  untouched(h);
});
await test("status retains token validation, missing-session rejection and GET rate limiting", async () => {
  const h = harness();
  assert.equal((await h.get("?mode=status", "invalid")).status, 404);
  assert.equal((await h.get("?mode=status", "b".repeat(48))).status, 404);
  let r;
  for (let i = 0; i < 121; i++) r = await h.get("?mode=status");
  assert.equal(r.status, 429);
});
await test("admin consumers use status mode; signer retains document GETs", async () => {
  for (const path of ["app/members/[id]/contract/page.tsx", "app/members/new/page.tsx"]) {
    const source = read(path);
    assert.match(source, /\/api\/signing-sessions\/\$\{[^}]+\}\?mode=status/);
    assert.match(source, /status: data.status/);
  }
  assert.doesNotMatch(read("app/sign/[token]/page.tsx"), /mode=status/);
});

function creationHarness(options = {}) {
  const A = { id: 3, name: "A", version: "1", fileUrl: "template-ref", active: true };
  const B = { id: 4, name: "B", version: "2", fileUrl: "template-b", active: true };
  let active = A, selected = 0, saved = null;
  const member = { id: 17, fullName: "Member", dni: "DOC", memberNumber: "17", phone: null, email: null };
  const mocks = {
    "next/server": { NextResponse: Response },
    "@/lib/auth-server": { requireStaffOrAdmin: async () => options.denied
      ? { ok: false, status: 403, error: "FORBIDDEN" } : { ok: true } },
    "@/lib/contract-templates": { findActiveContractTemplate: async () => { selected++; return active; } },
    "@/lib/storage": {
      isStorageUrlsDisabled: () => options.disabled ?? false,
      parseStorageUrl: ref => ({ bucket: "contract-templates", path: ref }),
      buildStoragePublicUrl: () => "https://storage.invalid/template",
      buildStoredStorageRef: (bucket, path) => `${bucket}/${path}`,
      createStorageSignedUrl: async (_ref, settings) => { assert.equal(settings.cache, false); return "https://storage.invalid/template"; },
    },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from: () => ({ download: async () => {
      active = B; // B becomes active after A was selected, before INSERT.
      return { data: new Blob(["document"]), error: null };
    } }) } }) },
    "@/lib/prisma": { prisma: {
      member: { findUnique: async () => options.missingMember ? null : member },
      signingSession: { create: async ({ data }) => {
        if (options.createError) throw options.createError;
        assert.equal(data.contractTemplateId, A.id);
        saved = { id: 9, status: "PENDING", ...data, member, contract: null, contractTemplate: A };
        return saved;
      } },
      clubSetting: { findUnique: async () => ({ defaultMonthlyLimitG: 30 }) },
      memberContract: { findFirst: async () => null },
    } },
  };
  const post = loader(mocks)("@/app/api/signing-sessions/route").POST;
  return { get saved() { return saved; }, get selected() { return selected; }, async post(body = { memberId: 17 }, raw = false) {
    const response = await post(new Request("https://club.invalid/api/signing-sessions", { method: "POST", body: raw ? body : JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } };
}

await test("A: authorized creation persists A even if B appears before INSERT", async () => {
  const h = creationHarness(), r = await h.post();
  assert.equal(r.status, 200); assert.equal(h.selected, 1);
  assert.equal(h.saved.contractTemplateId, 3); assert.equal(r.body.contractTemplate.id, 3);
  assert.match(h.saved.token, /^[a-f0-9]{48}$/); assert.ok(r.body.signUrl.includes(h.saved.token));
});
for (const value of [undefined, "17", 0, -1, 1.2, 2147483648]) await test(`creation validates memberId ${value}`, async () => {
  const h = creationHarness(); assert.equal((await h.post({ memberId: value })).status, 400); assert.equal(h.saved, null);
});
for (const [options, status] of [[{ denied: true }, 403], [{ missingMember: true }, 404], [{ disabled: true }, 503], [{ createError: new Error("PRIVATE_DB") }, 500]]) {
  await test(`creation failure ${status} does not persist session`, async () => {
    const h = creationHarness(options); const r = await h.post(); assert.equal(r.status, status); assert.equal(h.saved, null);
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_DB/);
  });
}
await test("creation malformed JSON", async () => { assert.equal((await creationHarness().post("{", true)).status, 400); });
await test("selected template deleted before INSERT: controlled FK conflict, no reselection", async () => {
  const { Prisma } = await import("@prisma/client");
  const h = creationHarness({ createError: new Prisma.PrismaClientKnownRequestError("PRIVATE_FK", { code: "P2003", clientVersion: "7.8.0" }) });
  const r = await h.post(); assert.equal(r.status, 409); assert.equal(h.selected, 1); assert.equal(h.saved, null);
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_FK/);
});

await test("B/C/M/N/T: existing session always GETs/signs/renders A; global selector forbidden", async () => {
  const h = harness();
  assert.equal((await h.get()).body.contractTemplate.id, 3);
  assert.equal((await h.post()).status, 200);
  assert.equal(contract(h).contractTemplateId, h.state.session.contractTemplateId);
  assert.equal(h.pdfSources[0].contractTemplateId, 3);
  assert.ok(h.uploads.length > 0, "real PDF rendered from the associated template");
});
await test("D: wrong expectation never writes", async () => {
  const h = harness(); const r = await h.post({}, undefined, 30, { expectedContractTemplateId: 4 });
  assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_TEMPLATE_CHANGED"); untouched(h);
});
for (const value of [undefined, null, "3", 1.5, 0, -1, 2147483648, {}, true]) await test(`E: strict precondition ${JSON.stringify(value)}`, async () => {
  const h = harness(); assert.equal((await h.post({}, undefined, 30, { expectedContractTemplateId: value })).status, 400); untouched(h);
});
await test("F: deactivating A does not revoke its session", async () => {
  const h = harness(); h.setTemplateActive(false);
  assert.equal((await h.get()).body.contractTemplate.id, 3);
  assert.equal((await h.post()).status, 200); assert.equal(contract(h).contractTemplateId, 3);
});
await test("G: unresolved legacy PENDING fails closed in GET and POST", async () => {
  const h = harness({ templateId: null });
  for (const r of [await h.get(), await h.post()]) { assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_TEMPLATE_UNRESOLVED"); }
  untouched(h);
});
for (const legacyTemplate of [3, null]) await test(`H: signed legacy wins; Storage unavailable; template ${legacyTemplate}`, async () => {
  const options = {}, h = harness(options); await h.post();
  h.setSessionTemplateId(null); h.setContractTemplateId(legacyTemplate);
  const before = h.state; options.storageDisabled = true; options.urlMissing = true;
  h.setSettingsError(new Error("Settings must not be read"));
  const r = await h.post({}, undefined, null, { expectedContractTemplateId: "invalid" });
  assert.equal(r.status, 200); assert.equal(r.body.status, "SIGNED");
  assert.equal(r.body.contractTemplate, null); assert.deepEqual(h.state, before);
  assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
});
await test("H: legacy session null still returns the contract's historical template", async () => {
  const h = harness(); await h.post(); h.setSessionTemplateId(null);
  assert.equal((await h.get()).body.contractTemplate.id, 3);
  assert.equal((await h.post({}, undefined, 30, { expectedContractTemplateId: 4 })).body.contractTemplate.id, 3);
  assert.equal(h.calls.creates, 1);
});
await test("DB errors are never converted to template availability errors", async () => {
  const options = {}, h = harness(options); await h.post(); options.templateDbError = true;
  await assert.rejects(h.get(), /PRIVATE_TEMPLATE_DB/);
});
for (const [name, options] of [["I disabled", { storageDisabled: true }], ["J missing", { objectMissing: true }],
  ["empty", { objectEmpty: true }], ["L URL failure", { urlMissing: true }]]) await test(`${name}: GET/POST unavailable, no signature`, async () => {
  const h = harness(options);
  for (const r of [await h.get(), await h.post()]) { assert.equal(r.status, 503); assert.equal(r.body.code, "SIGNING_TEMPLATE_UNAVAILABLE"); }
  untouched(h);
});
await test("K: a previously available URL cannot authorize a now-missing object", async () => {
  const settings = [], options = { onSignedUrl: s => settings.push(s) }, h = harness(options);
  assert.equal((await h.get()).status, 200); assert.equal(settings[0].cache, false);
  options.objectMissing = true;
  assert.equal((await h.post()).status, 503); assert.equal(settings.length, 1); untouched(h);
});
await test("O: two pending reads produce one contract/audit (serialized double)", async () => {
  const h = harness({ simultaneous: true }); const results = await Promise.all([h.post(), h.post()]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
});
for (const id of [4, null]) await test(`P: association changes before claim to ${id}`, async () => {
  const h = harness({ beforeClaim: state => { state.session.contractTemplateId = id; } });
  const r = await h.post(); assert.equal(r.status, 409);
  assert.equal(r.body.code, id === null ? "SIGNING_TEMPLATE_UNRESOLVED" : "SIGNING_TEMPLATE_CHANGED"); untouched(h);
});
await test("Q: competing POST commits while first preflight fails; recover historical success", async () => {
  const entered = deferred(), resume = deferred(); let reads = 0;
  const h = harness({ beforeDocumentRead: async () => {
    if (++reads === 1) { entered.release(); await resume.promise; throw new Error("Storage unavailable"); }
  } });
  const first = h.post(); await entered.promise;
  assert.equal((await h.post()).status, 200); resume.release();
  assert.equal((await first).status, 200); assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
});
await test("R: audit failure rolls back claim and snapshot", async () => {
  const h = harness({ auditError: new Error("PRIVATE_AUDIT") }); assert.equal((await h.post()).status, 500);
  assert.deepEqual(h.state, h.initial); assert.equal(h.calls.rollbacks, 1);
});
await test("S: monthly limit precondition remains authoritative", async () => {
  const h = harness(); await h.get(); h.setMonthlyLimit(60);
  const r = await h.post(); assert.equal(r.status, 409); assert.equal(r.body.code, "MONTHLY_LIMIT_CHANGED");
  assert.deepEqual(h.state, h.initial);
});

// Exercise actual Storage parser/cache with an in-memory SDK; no real credentials or network.
await test("Storage helper rejects foreign buckets, empty objects and bypasses a real URL cache", async () => {
  let missing = false, downloads = 0, urls = 0;
  const fakeProcess = { env: { SUPABASE_URL: "https://storage.invalid" } };
  const loadCache = new Map();
  const mocks = { "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from: () => ({
    download: async (_path, _options, parameters) => {
      assert.equal(parameters.cache, "no-store");
      downloads++; return missing ? { error: true } : { data: new Blob(["PDF"]), error: null };
    },
    createSignedUrl: async () => { urls++; return { data: { signedUrl: "https://storage.invalid/signed" }, error: null }; },
  }) } }) } };
  const { createRequire } = await import("node:module"); const require = createRequire(import.meta.url);
  function load(name) {
    if (name in mocks) return mocks[name]; if (!name.startsWith("@/")) return require(name);
    if (loadCache.has(name)) return loadCache.get(name);
    const exports = {}; loadCache.set(name, exports);
    vm.runInNewContext(ts.transpileModule(read(name.slice(2) + ".ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, require: load, process: fakeProcess, console, URL, Buffer, Error });
    return exports;
  }
  const storage = load("@/lib/contract-storage"), ref = "contract-templates/A.pdf";
  await storage.createSignedUrlForAllowedStorageRef(ref); assert.equal(urls, 1);
  await storage.requireSigningTemplateDocument(ref); assert.equal(urls, 2); assert.equal(downloads, 1);
  missing = true;
  await assert.rejects(storage.requireSigningTemplateDocument(ref), e => e.code === "SIGNING_TEMPLATE_UNAVAILABLE");
  assert.equal(urls, 2); assert.equal(downloads, 2);
  for (const ref of ["foreign/A.pdf", "https://evil.invalid/A.pdf"]) {
    await assert.rejects(storage.requireSigningTemplateDocument(ref), e => e.code === "SIGNING_TEMPLATE_UNAVAILABLE");
  }
  assert.equal(downloads, 2);
});

function pageHarness(initial, postCode = "SIGNING_TEMPLATE_CHANGED", refresh = initial) {
  const slots = [], effects = [], requests = []; let cursor = 0, tree, ink = true, cleared = 0;
  const canvas = { isEmpty: () => !ink, clear: () => { ink = false; cleared++; }, getTrimmedCanvas: () => ({ toDataURL: () => "PNG" }) };
  const hooks = {
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], v => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect: fn => { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const jsx = (type, props) => { if (type === "Canvas") props.ref.current = canvas; return { type, props }; };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read("app/sign/[token]/page.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, console, require: name => ({ react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/navigation": { useParams: () => ({ token: "token" }) }, "react-signature-canvas": "Canvas" })[name],
    fetch: async (_url, options = {}) => {
      requests.push(options);
      if (options.method === "POST") return Response.json({ code: postCode, error: postCode }, { status: 409 });
      return Response.json(requests.length === 1 ? initial : refresh);
    },
  });
  const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === "object" ? [v, ...nodes(v.props?.children)] : [];
  const render = () => { cursor = 0; tree = exports.default(); };
  render(); effects.forEach(fn => fn());
  return { requests, get cleared() { return cleared; },
    async flush() { for (let i = 0; i < 15; i++) await new Promise(r => setImmediate(r)); render(); },
    button: text => nodes(tree).find(n => n.type === "button" && JSON.stringify(n.props.children).includes(text)),
  };
}
const pending = { status: "PENDING", member: { fullName: "M", dni: "D", consumptionGrams: 30 },
  contractTemplate: { id: 3, name: "A", version: "1", fileUrl: "https://storage.invalid/A" } };
await test("U: UI sends ID, clears on CHANGED, refreshes GET only and requires fresh ink", async () => {
  const h = pageHarness(pending); await h.flush(); h.button("Confirmar y guardar").props.onClick(); await h.flush();
  const posts = h.requests.filter(r => r.method === "POST"); assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].body).expectedContractTemplateId, 3); assert.equal(h.cleared, 1);
  assert.equal(h.requests.length, 3); h.button("Confirmar y guardar").props.onClick(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === "POST").length, 1);
});
await test("U: UI blocks without template or URL", async () => {
  for (const contractTemplate of [null, { ...pending.contractTemplate, fileUrl: "" }]) {
    const h = pageHarness({ ...pending, contractTemplate }); await h.flush();
    assert.equal(h.button("Confirmar y guardar").props.disabled, true);
    h.button("Confirmar y guardar").props.onClick(); await h.flush(); assert.equal(h.requests.length, 1);
  }
});
await test("U: UNAVAILABLE clears and blocks; explicit document retry never retries POST", async () => {
  const h = pageHarness(pending, "SIGNING_TEMPLATE_UNAVAILABLE"); await h.flush();
  h.button("Confirmar y guardar").props.onClick(); await h.flush(); assert.equal(h.cleared, 1);
  assert.equal(h.button("Confirmar y guardar"), undefined); assert.equal(h.requests.length, 2);
  h.button("Reintentar carga").props.onClick(); await h.flush();
  assert.equal(h.requests.length, 3); assert.equal(h.requests.filter(r => r.method === "POST").length, 1);
});
await test("U: UNRESOLVED blocks and has no automatic retry", async () => {
  const h = pageHarness(pending, "SIGNING_TEMPLATE_UNRESOLVED"); await h.flush();
  h.button("Confirmar y guardar").props.onClick(); await h.flush();
  assert.equal(h.cleared, 1); assert.equal(h.button("Confirmar y guardar"), undefined); assert.equal(h.requests.length, 2);
});
await test("Migration/schema agree; only proven contract associations backfilled", async () => {
  const sql = read("prisma/migrations/20260923120000_bind_signing_session_template_742/migration.sql");
  assert.match(sql, /ADD COLUMN "contractTemplateId" INTEGER;/);
  assert.match(sql, /c\."signingSessionId" = s\."id"/);
  assert.match(sql, /c\."contractTemplateId" IS NOT NULL/);
  assert.match(sql, /CREATE INDEX "SigningSession_contractTemplateId_idx"/);
  assert.match(sql, /ON DELETE RESTRICT ON UPDATE RESTRICT/);
  assert.ok(sql.indexOf('UPDATE "SigningSession"') < sql.indexOf("FOREIGN KEY"));
  assert.doesNotMatch(sql, /DEFAULT|SET NOT NULL|active|UPDATE "MemberContract"/);
  const schema = read("prisma/schema.prisma").split("model SigningSession {")[1].split("model ClubSetting")[0];
  assert.match(schema, /contractTemplateId Int\?/);
  assert.match(schema, /onDelete: Restrict, onUpdate: Restrict/);
  assert.match(schema, /@@index\(\[contractTemplateId\]\)/);
  for (const path of ["lib/signing-session.ts", "app/api/signing-sessions/[token]/route.ts"]) {
    assert.doesNotMatch(read(path), /findActiveContractTemplate|resolveContractTemplateForContract/);
  }
});
console.log(`${checks} checks passed. Real application logic, controlled infrastructure; no real PostgreSQL/Storage/browser concurrency claim.`);
