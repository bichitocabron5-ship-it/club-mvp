// Real signing routes, serializer, settings helper, PDF generator and Sales engine.
// Controlled Prisma/storage and React hook doubles; no PostgreSQL concurrency claim.
// Run: node scripts/test-public-signing-consumption.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { harness, committed, rolledBack, loader } from "./test-public-signing-identity.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const X = 42;
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const post = (h, form = {}, expected = X) => h.post(form, undefined, expected);

for (const [label, value] of [
  ["A/Q", X], ["B", 999], ["C", 1], ["D", undefined], ["E", ""], ["F", "   "],
  ["G", null], ["G-object", { ignored: true }], ["G-array", [1]], ["G-bool", false],
  ["H", 1e100], ["zero", 0], ["negative", -1], ["decimal", 1.5], ["1000", 1000],
]) await test(`${label}/AL: legacy ${JSON.stringify(value)} cannot authorize or clear limit`, async () => {
  const h = harness({ monthlyLimit: X });
  const result = await post(h, value === undefined ? {} : { consumptionGrams: value });
  assert.equal(result.status, 200);
  assert.equal(committed(h).consumptionGrams, X);
  assert.equal(result.body.member.consumptionGrams, X);
  assert.equal(h.calls.settingsLocks, 1, "real helper locks inside transaction");
});

await test("I/J/M/N/AH: pending uses settings, previous contract remains unchanged", async () => {
  for (const previous of [false, true]) {
    const h = harness({ monthlyLimit: X, previous });
    const before = h.state.contracts;
    const shown = await h.get();
    assert.equal(shown.status, 200);
    assert.equal(shown.body.member.consumptionGrams, X);
    assert.equal(shown.body.clubSettings.defaultMonthlyLimitG, X);
    assert.equal(shown.body.monthlyLimitError, null);
    assert.equal((await post(h)).status, 200);
    assert.equal(committed(h).consumptionGrams, X);
    assert.deepEqual(h.state.contracts.slice(0, before.length), before);
  }
});

for (const value of [undefined, null, 0, -1, 1.5, "42", NaN, Infinity, 2147483648]) {
  await test(`K/L: absent/invalid persisted settings ${String(value)} fail closed`, async () => {
    const h = harness({ monthlyLimit: value, previous: true });
    const shown = await h.get();
    assert.equal(shown.body.member.consumptionGrams, null);
    assert.equal(shown.body.clubSettings.defaultMonthlyLimitG, null);
    assert.equal(shown.body.monthlyLimitError, "MONTHLY_LIMIT_NOT_CONFIGURED");
    const result = await post(h);
    assert.equal(result.status, 503);
    assert.equal(result.body.code, "MONTHLY_LIMIT_NOT_CONFIGURED");
    rolledBack(h);
    assert.equal(h.calls.creates, 0); assert.equal(h.calls.audits, 0);
  });
}
await test("administrative range: no arbitrary public maximum of 1000", async () => {
  const h = harness({ monthlyLimit: 1001 });
  assert.equal((await post(h, {}, 1001)).status, 200);
  assert.equal(committed(h).consumptionGrams, 1001);
});
await test("settings infrastructure is controlled 503, not payload 400 or replay recovery", async () => {
  const { Prisma } = require("@prisma/client");
  for (const error of [new Error("PRIVATE_DB_DETAILS"), new Prisma.PrismaClientKnownRequestError("PRIVATE_SQL", {
    code: "P2002", clientVersion: "test", meta: { target: ["signingSessionId"] },
  })]) {
    const h = harness({ monthlyLimit: X, settingsError: error });
    assert.equal((await h.get()).body.monthlyLimitError, "MONTHLY_LIMIT_UNAVAILABLE");
    const result = await post(h);
    assert.equal(result.status, 503); assert.equal(result.body.code, "MONTHLY_LIMIT_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Prisma|SQL|stack/);
    rolledBack(h); assert.equal(h.calls.globalRecoveries, 0);
  }
});
await test("R/S/T/U/V: GET X then persisted Y rejects stale acceptance atomically", async () => {
  const h = harness({ monthlyLimit: X });
  assert.equal((await h.get()).body.member.consumptionGrams, X);
  h.setMonthlyLimit(60);
  const result = await post(h);
  assert.equal(result.status, 409); assert.equal(result.body.code, "MONTHLY_LIMIT_CHANGED");
  rolledBack(h);
  assert.equal(h.calls.creates, 0); assert.equal(h.calls.audits, 0);
  assert.equal((await h.get()).body.member.consumptionGrams, 60);
  assert.equal((await post(h, {}, 60)).status, 200);
  assert.equal(committed(h).consumptionGrams, 60);
});
await test("precondition is mandatory, positive integer and never coerced", async () => {
  const missing = harness({ monthlyLimit: X });
  assert.equal((await missing.post({}, undefined, X, { expectedConsumptionGrams: undefined })).status, 400);
  rolledBack(missing);
  for (const value of [null, "42", 0, -1, 1.5, {}, 2147483648]) {
    const h = harness({ monthlyLimit: X });
    assert.equal((await post(h, {}, value)).status, 400); rolledBack(h);
  }
  const h = harness({ monthlyLimit: X });
  // Function argument NaN serializes as null: malformed acceptance stays invalid.
  assert.equal((await post(h, {}, NaN)).status, 400); rolledBack(h);
});
await test("Y/Z/AA: replay bypasses changed, absent and inaccessible settings", async () => {
  for (const state of [60, undefined, "error"]) {
    const h = harness({ monthlyLimit: X });
    assert.equal((await post(h)).status, 200);
    const before = h.state, reads = h.calls.settingsReads, locks = h.calls.settingsLocks;
    if (state === "error") h.setSettingsError(new Error("Settings must not be read"));
    else h.setMonthlyLimit(state);
    const response = await post(h, { consumptionGrams: null, dni: "" }, null);
    assert.equal(response.status, 200);
    assert.equal(response.body.member.consumptionGrams, X);
    assert.equal((await h.get()).body.member.consumptionGrams, X);
    assert.deepEqual(h.state, before);
    assert.equal(h.calls.settingsReads, reads); assert.equal(h.calls.settingsLocks, locks);
    assert.equal(h.calls.audits, 1); assert.equal(h.uploads.length, 1);
  }
});
await test("AB: two pending reads recover one contract (serialized transaction double only)", async () => {
  const h = harness({ monthlyLimit: X, simultaneous: true, onCommit: () => {
    h.setSettingsError(new Error("Settings unavailable after first commit"));
  } });
  const results = await Promise.all([post(h, { consumptionGrams: 1 }), post(h, { consumptionGrams: 999 })]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(committed(h).consumptionGrams, X);
  assert.equal(h.calls.creates, 1); assert.equal(h.calls.audits, 1);
  assert.equal(h.calls.settingsLocks, 1, "losing transaction recovers before settings");
});
await test("AC/AD/AE/AF: authoritative audit and actual PDF drawing; audit failure rolls back", async () => {
  const h = harness({ monthlyLimit: X });
  assert.equal((await post(h, { consumptionGrams: 999 })).status, 200);
  committed(h); // exact audit metadata, including absence of PII
  assert.equal(h.pdfSources[0].consumptionGrams, X);
  assert.ok(h.pdfText.includes(String(X)), "real PDF generator draws X");
  assert.ok(!h.pdfText.includes("999"));
  assert.equal(h.uploads.length, 1);
  const broken = harness({ monthlyLimit: X, auditError: new Error("PRIVATE_AUDIT") });
  assert.equal((await post(broken)).status, 500); rolledBack(broken);
});

await test("AG: real Sales engine reads newly signed X and enforces its monthly boundary", async () => {
  const h = harness({ monthlyLimit: X });
  await post(h, { consumptionGrams: 999 });
  const contract = committed(h);
  const boundaryReached = new Error("reached stock write after all limit checks");
  let accumulated = X, contractReads = 0;
  const tx = {
    dayClosure: { findUnique: async () => null },
    member: { findUnique: async () => ({ ...h.members[0], expiresAt: null }) },
    memberContract: { findFirst: async ({ where, select, orderBy }) => {
      assert.equal(where.memberId, contract.memberId);
      assert.equal(select.consumptionGrams, true); assert.equal(orderBy.signedAt, "desc");
      contractReads++; return contract;
    } },
    product: {
      findMany: async () => [{ id: 1, name: "Test", unit: "G", active: true, stock: 100, price: 1, averageCost: 0 }],
      updateMany: async () => { throw boundaryReached; },
    },
    sale: { findMany: async ({ where }) => where.createdAt.lt
      ? [{ qty: accumulated, product: { unit: "G" } }] : [] },
  };
  const engine = loader({
    "@/lib/prisma": { prisma: { $transaction: async fn => fn(tx) } },
    "@/lib/club-settings": { getClubSettings: async () => ({ dailyLimitG: 10, dailyLimitUd: 15 }) },
    "@/lib/audit": { createAuditLog: async () => { throw new Error("unexpected sale commit"); } },
  })("@/lib/sales-engine");
  const input = { memberId: contract.memberId, operatorUserId: 1, operationType: "SINGLE", items: [{ productId: 1, qty: 1 }] };
  await assert.rejects(engine.createSaleTransaction(input), error =>
    error instanceof engine.SaleValidationError && error.message === `Limite mensual de gramos superado (${X} g)`);
  accumulated = X - 1;
  await assert.rejects(engine.createSaleTransaction(input), error => error === boundaryReached);
  assert.equal(contractReads, 2);
});

await test("AI/AJ/AK: actual auth guards keep settings and contract PATCH ADMIN-only", async () => {
  let role = "STAFF", settingsWrites = 0, contractWrites = 0;
  const auth = { id: "1", role: "ADMIN" }; // persisted role must override stale session role
  const load = loader({
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: auth }) },
    "@/lib/auth": { authConfig: {} },
    "@/lib/prisma": { prisma: {
      appUser: { findUnique: async () => ({ id: 1, role, active: true, name: "Test", email: null }) },
      clubSetting: { upsert: async ({ update }) => { settingsWrites++; return update; } },
      memberContract: {
        findUnique: async () => ({ id: 9 }),
        update: async ({ data }) => { contractWrites++; return { id: 9, ...data }; },
      },
    } },
  });
  const settings = load("@/app/api/admin/settings/route");
  const contracts = load("@/app/api/contracts/[id]/route");
  const request = body => new Request("http://test", { method: "PATCH", body: JSON.stringify(body) });
  const values = { dailyLimitG: 10, dailyLimitUd: 15, defaultMonthlyLimitG: 1001 };
  assert.equal((await settings.PATCH(request(values))).status, 403);
  assert.equal((await contracts.PATCH(request({ consumptionGrams: 10 }), { params: Promise.resolve({ id: "9" }) })).status, 403);
  assert.equal(settingsWrites + contractWrites, 0);
  role = "ADMIN";
  assert.equal((await settings.PATCH(request(values))).status, 200);
  assert.equal(settingsWrites, 1);
  for (const value of [1001, null]) {
    const res = await contracts.PATCH(request({ consumptionGrams: value }), { params: Promise.resolve({ id: "9" }) });
    assert.equal(res.status, 409); assert.equal((await res.json()).code, "SIGNED_CONTRACT_IMMUTABLE");
  }
  assert.equal(contractWrites, 0);
});

// Execute the actual page with controlled hook state and fetch. This is not a DOM/browser test.
const pageSource = readFileSync(resolve(root, "app/sign/[token]/page.tsx"), "utf8");
function pageHarness(initial, refreshed = initial, refreshFails = false) {
  const slots = [], effects = [], requests = [];
  let cursor = 0, tree, cleared = 0, ink = true;
  const canvas = { isEmpty: () => !ink, clear: () => { ink = false; cleared++; }, getTrimmedCanvas: () => ({ toDataURL: () => "signature" }) };
  const hooks = {
    useState(initialValue) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initialValue;
      return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initialValue) { const i = cursor++; return slots[i] ??= { current: initialValue }; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const jsx = (type, props) => {
    if (type === "SignatureCanvas") props.ref.current = canvas;
    return { type, props };
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(pageSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    exports, console,
    require: name => ({ react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/navigation": { useParams: () => ({ token: "test-token" }) }, "react-signature-canvas": "SignatureCanvas" })[name],
    fetch: async (_url, options = {}) => {
      requests.push(options);
      if (options.method === "POST") return Response.json({ code: "MONTHLY_LIMIT_CHANGED", error: "El límite mensual ha cambiado. Revisa el nuevo valor antes de firmar." }, { status: 409 });
      if (requests.length > 1 && refreshFails) throw new Error("offline");
      return Response.json(requests.length === 1 ? initial : refreshed);
    },
  });
  const nodes = value => {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [];
    return [value, ...nodes(value.props?.children)];
  };
  const render = () => { cursor = 0; tree = exports.default(); return tree; };
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); effects.forEach(fn => fn());
  return {
    flush, requests, nodes: () => nodes(tree), text: () => JSON.stringify(tree),
    confirm: () => nodes(tree).find(n => n.type === "button" && JSON.stringify(n.props.children).includes("Confirmar y guardar")),
    get cleared() { return cleared; }, draw() { ink = true; },
  };
}
const pending = (value, error = null) => ({ documentSnapshotId: "11111111-1111-4111-8111-111111111111", status: "PENDING", member: { fullName: "Test", dni: "ABC", consumptionGrams: value }, monthlyLimitError: error, contractTemplate: { id: 3, name: "Template", version: "1", fileUrl: "https://storage.invalid/template" } });
await test("O/P/W/X: actual UI displays read-only X, sends expected X, refreshes Y without POST retry", async () => {
  assert.doesNotMatch(pageSource, /form\.consumptionGrams|placeholder="30"|\?\?\s*30\b|Consumo mensual declarado/);
  const h = pageHarness(pending(X), pending(60));
  await h.flush();
  assert.ok(h.text().includes(`${X} g`));
  assert.ok(!h.nodes().some(n => n.type === "input" && n.props.type === "number"));
  h.confirm().props.onClick(); await h.flush();
  const sent = h.requests.filter(r => r.method === "POST");
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0].body).expectedConsumptionGrams, X);
  assert.ok(!Object.hasOwn(JSON.parse(sent[0].body).form, "consumptionGrams"));
  assert.equal(h.cleared, 1); assert.ok(h.text().includes("60 g"));
  h.confirm().props.onClick(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === "POST").length, 1, "cleared signature requires drawing again");
  h.draw(); h.confirm().props.onClick(); await h.flush();
  assert.equal(h.requests.filter(r => r.method === "POST").length, 2, "only explicit new acceptance sends again");
});
await test("UI missing/unavailable config and failed refresh keep confirmation blocked", async () => {
  for (const error of ["MONTHLY_LIMIT_NOT_CONFIGURED", "MONTHLY_LIMIT_UNAVAILABLE"]) {
    const h = pageHarness(pending(null, error)); await h.flush();
    assert.equal(h.confirm().props.disabled, true);
    h.confirm().props.onClick(); await h.flush();
    assert.equal(h.requests.filter(r => r.method === "POST").length, 0);
  }
  const h = pageHarness(pending(X), pending(60), true); await h.flush();
  h.confirm().props.onClick(); await h.flush();
  assert.equal(h.confirm().props.disabled, true);
  assert.ok(h.text().includes("Recarga la página"));
});
await test("signed UI shows historical value, including explicit absent value", async () => {
  for (const value of [X, null]) {
    const h = pageHarness({ ...pending(value), status: "SIGNED", clubSettings: { defaultMonthlyLimitG: 999 } });
    await h.flush();
    assert.ok(h.text().includes(value === null ? "No indicado" : `${X} g`));
    assert.ok(!h.text().includes("999 g")); assert.equal(h.confirm(), undefined);
  }
});
console.log(`${checks} checks passed. A-AL covered with real application logic and controlled dependencies. No PostgreSQL concurrency, production, or browser claim.`);
