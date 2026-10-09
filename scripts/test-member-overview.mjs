// Execute production route/auth/DNI parser/core/rules with in-memory Prisma boundaries.
// No database, network, Storage or frontend. Query arguments are real; SQL is not executed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const now = new Date("2026-10-08T12:00:00Z");
const start = new Date(2026, 9, 1), end = new Date(2026, 10, 1);
const plain = value => JSON.parse(JSON.stringify(value));
const member = {
  id: 17, memberNumber: "A17", fullName: "Socio", joinedAt: now,
  active: true, expiresAt: null, rfidCode: "PRIVATE_TAG",
  dniFrontUrl: "members/17/dni-front.jpg", dniBackUrl: "PRIVATE_INVALID_REF",
  dni: "PRIVATE_DNI", email: "PRIVATE_EMAIL", phone: "PRIVATE_PHONE",
  commercialNotes: "PRIVATE_NOTES", photoUrl: "storage://PRIVATE_PHOTO",
  commercialProfile: "STANDARD", discountPercent: 0, futureSensitiveField: "PRIVATE_FUTURE",
};
const contract = { id: 2, memberId: 17, signedAt: now, consumptionGrams: 30,
  signingSessionId: null, signedPdfUrl: null, signatureImage: "PRIVATE_SIGNATURE" };
const document = { id: 4, memberId: 17, type: "ID_BACK", createdAt: now,
  storageBucket: "member-documents", storageKey: "PRIVATE_BROKEN_KEY",
  mimeType: "image/jpeg", byteLength: 123, sha256: "PRIVATE_HASH" };
function first(rows, query) {
  return rows.filter(row => Object.entries(query.where).every(([key, value]) => row[key] === value))
    .sort((a, b) => {
      for (const clause of query.orderBy) {
        const [key, direction] = Object.entries(clause)[0];
        const delta = a[key] - b[key];
        if (delta) return direction === "desc" ? -delta : delta;
      }
      return 0;
    })[0] ?? null;
}

function harness(options = {}) {
  const state = { role: "STAFF", active: true, contracts: [contract], documents: [document],
    accesses: [{ id: 1, memberId: 17, type: "IN", createdAt: now }], sales: [], ...options };
  const reads = [];
  const calls = [];
  let storageCalls = 0;
  function record(name, query) {
    reads.push({ name, query: plain(query) });
    if (state.failure === name) throw new Error("PRIVATE_DATABASE_FAILURE");
  }
  const prisma = {
    appUser: { findUnique: async query => {
      record("auth", query);
      return state.missingUser ? null : { id: 1, role: state.role, active: state.active };
    } },
    member: { findUnique: async query => {
      record("member", query);
      // Extra columns deliberately returned to exercise response allowlisting too.
      return state.missing ? null : { ...member, ...state.member };
    } },
    memberContract: { findFirst: async query => { record("contract", query); return first(state.contracts, query); } },
    memberDocument: { findFirst: async query => { record("document", query); return first(state.documents, query); } },
    accessLog: {
      findFirst: async query => { record("access", query); return first(state.accesses, query); },
      findMany: async query => { record("accessHistory", query); return state.accesses.slice(0, query.take); },
    },
    signingSession: { findFirst: async query => { record("session", query); return state.pendingSession ?? null; } },
    sale: { findMany: async query => {
      record("sales", query);
      const { memberId, cancelledAt, createdAt } = query.where;
      return state.sales.filter(sale => sale.memberId === memberId &&
        (cancelledAt === undefined || sale.cancelledAt === cancelledAt) &&
        sale.createdAt >= createdAt.gte && sale.createdAt < createdAt.lt);
    } },
  };
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => state.anonymous ? null : { user: { id: "1", role: state.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/prisma": { prisma },
    "@/lib/supabase-admin": { getSupabaseAdmin() { storageCalls++; throw new Error("Storage forbidden"); } },
    sharp() { throw new Error("Image processing forbidden"); },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    assert.ok(name.startsWith("@/"), `Unexpected dependency ${name}`);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, `${name.slice(2)}.ts`), exports = {};
    cache.set(name, exports);
    let source = readFileSync(filename, "utf8").replaceAll("\r\n", "\n");
    for (const mutation of [...JSON.parse(process.env.OVERVIEW_MUTATIONS ?? "[]"), ...(state.mutations ?? [])]) {
      if (mutation.file !== name) continue;
      assert.ok(source.includes(mutation.from), "Mutation anchor missing");
      source = source.replaceAll(mutation.from, mutation.to);
    }
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [(state.now ?? now).getTime()])); } }
    vm.runInNewContext(code, { exports, require: load, Response, Request, URL, Date: Clock,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://club.test" } },
      fetch() { throw new Error("Network forbidden"); },
    }, { filename });
    for (const key of ["getMemberOperationalFacts", "composeMemberOperationalStatus", "getMonthRange", "getMonthlyGramTotal", "resolveMemberDni"]) {
      if (typeof exports[key] !== "function") continue;
      const real = exports[key];
      exports[key] = (...args) => {
        const result = real(...args);
        calls.push({ key, args, result });
        return result;
      };
    }
    return exports;
  }
  return { state, reads, calls, load, get storageCalls() { return storageCalls; },
    get: (id = "17", route = "overview") => load(`@/app/api/members/[id]/${route}/route`).GET(
      new Request("http://test/overview"), { params: Promise.resolve({ id }) }) };
}
async function body(h) {
  const response = await h.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

for (const [name, options, status] of [
  ["anonymous", { anonymous: true }, 401], ["inactive", { active: false }, 401],
  ["missing user", { missingUser: true }, 401], ["persisted MEMBER despite ADMIN JWT", { role: "MEMBER" }, 403],
  ["STAFF despite MEMBER JWT", { jwtRole: "MEMBER" }, 200],
  ["ADMIN despite MEMBER JWT", { role: "ADMIN", jwtRole: "MEMBER" }, 200],
]) test(`authorization and cache: ${name}`, async () => {
  const h = harness(options), response = await h.get();
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(h.reads.filter(r => r.name === "auth").length, options.anonymous ? 0 : 1);
  if (status !== 200) {
    assert.deepEqual(await response.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
    assert.equal(h.reads.filter(r => r.name !== "auth").length, 0);
  }
});
test("authority is reread after role change and deactivation", async () => {
  const h = harness(); await body(h);
  h.state.role = "MEMBER"; assert.equal((await h.get()).status, 403);
  h.state.active = false; assert.equal((await h.get()).status, 401);
  h.state.active = true; h.state.role = "STAFF"; h.state.missingUser = true;
  assert.equal((await h.get()).status, 401);
  assert.equal(h.reads.filter(r => r.name === "auth").length, 4);
  assert.equal(h.reads.filter(r => r.name === "member").length, 1);
});
for (const role of ["STAFF", "ADMIN"]) test(`exact DTO and no extra PII for ${role}`, async () => {
  const result = await body(harness({ role }));
  assert.deepEqual(result, {
    identity: { id: 17, memberNumber: "A17", fullName: "Socio", joinedAt: now.toISOString() },
    operational: { active: true, expiresAt: null, expired: false, hasContract: true, canWithdraw: true,
      reasons: { inactive: false, noContract: false, expired: false }, hasRfid: true },
    contract: { id: 2, signedAt: now.toISOString() },
    consumption: { monthlyGrams: 0, monthlyLimitG: 30, periodStart: start.toISOString(), periodEndExclusive: end.toISOString() },
    documentation: { hasDniFront: true, hasDniBack: true },
    access: { lastEvent: { type: "IN", createdAt: now.toISOString() } },
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|storage:|rfidCode|photoUrl|commercial|signature|remaining|isInside/);
});
test("minimal selects, six domain reads, no Storage, no collection histories", async () => {
  const h = harness(); await body(h);
  assert.equal(h.reads.length, 7);
  const query = name => {
    const entry = h.reads.find(r => r.name === name);
    assert.ok(entry, `Missing bounded query: ${name}`);
    return entry.query;
  };
  assert.deepEqual(query("member"), { where: { id: 17 }, select: {
    id: true, memberNumber: true, fullName: true, joinedAt: true, active: true,
    expiresAt: true, rfidCode: true, dniFrontUrl: true, dniBackUrl: true,
  } });
  assert.deepEqual(query("contract"), { where: { memberId: 17 },
    orderBy: [{ signedAt: "desc" }, { id: "desc" }], select: { id: true, signedAt: true, consumptionGrams: true } });
  assert.deepEqual(query("sales"), { where: { memberId: 17, cancelledAt: null,
    createdAt: { gte: start.toISOString(), lt: end.toISOString() } },
    select: { qty: true, product: { select: { unit: true } } } });
  assert.deepEqual(query("access"), { where: { memberId: 17 },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { type: true, createdAt: true } });
  for (const { query: q } of h.reads.filter(r => r.name === "document")) {
    assert.deepEqual(q.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.deepEqual(q.select, { storageBucket: true, storageKey: true, mimeType: true, byteLength: true, sha256: true });
  }
  assert.deepEqual(h.reads.filter(r => r.name === "document").map(r => r.query.where), [
    { memberId: 17, type: "ID_FRONT" }, { memberId: 17, type: "ID_BACK" },
  ]);
  assert.equal(h.storageCalls, 0);
});
test("reference contract uses signedAt then id; historical rows need no session/PDF", async () => {
  const h = harness({ contracts: [contract, { ...contract, id: 3, consumptionGrams: 12 },
    { ...contract, id: 90, signedAt: new Date(now - 1) }, { ...contract, id: 100, memberId: 18 }] });
  const result = await body(h);
  assert.equal(result.contract.id, 3);
  assert.equal(result.consumption.monthlyLimitG, 12);
  assert.equal(h.reads.filter(r => r.name === "contract").length, 1);
});
test("missing contract is not replaced with a signing session or club default", async () => {
  const h = harness({ contracts: [], accesses: [], documents: [],
    pendingSession: { id: 50, memberId: 17, status: "PENDING", signedAt: null, consumptionGrams: 99 },
    member: { memberNumber: null, rfidCode: null, dniFrontUrl: null, dniBackUrl: null } });
  const result = await body(h);
  assert.equal(h.reads.some(r => r.name === "session"), false);
  assert.equal(result.contract, null);
  assert.equal(result.operational.hasContract, false);
  assert.equal(result.operational.canWithdraw, false);
  assert.equal(result.operational.hasRfid, false);
  assert.equal(result.consumption.monthlyLimitG, null);
  assert.equal(result.identity.memberNumber, null);
  assert.equal(result.access.lastEvent, null);
  assert.deepEqual(result.documentation, { hasDniFront: false, hasDniBack: false });
});
test("overview matches operational-status consumed by TPV across operational states", async () => {
  for (const active of [true, false]) for (const expiresAt of [null, new Date(now - 1), now, new Date(+now + 1)]) {
    for (const contracts of [[], [contract], [{ ...contract, consumptionGrams: null }],
      [contract, { ...contract, id: 3, consumptionGrams: 7 }]]) {
      const h = harness({ member: { active, expiresAt }, contracts });
      const overview = await body(h), status = await (await h.get("17", "operational-status")).json();
      for (const key of ["expired", "hasContract", "canWithdraw", "reasons"]) {
        assert.deepEqual(overview.operational[key], status[key]);
      }
      assert.equal(overview.operational.active, status.member.active);
      assert.equal(overview.operational.expiresAt, status.member.expiresAt);
      assert.equal(overview.consumption.monthlyLimitG, status.contract?.monthlyLimitG ?? null);
      assert.equal(overview.operational.expired, expiresAt !== null && expiresAt < now);
      assert.equal(overview.operational.canWithdraw, active && !(expiresAt !== null && expiresAt < now) && contracts.length > 0);
    }
  }
});
test("RFID presence keeps Boolean semantics and null/zero limits are not defaulted", async () => {
  for (const [rfidCode, expected] of [[null, false], ["", false], [" ", true], ["TAG", true]]) {
    for (const consumptionGrams of [null, 0]) {
      const result = await body(harness({ member: { rfidCode }, contracts: [{ ...contract, consumptionGrams }] }));
      assert.equal(result.operational.hasRfid, expected);
      assert.equal(result.consumption.monthlyLimitG, consumptionGrams);
    }
  }
});
test("monthly grams use canonical normalization, cancellation and half-open month", async () => {
  const sale = { memberId: 17, qty: 1.25, product: { unit: "G" }, cancelledAt: null, createdAt: start };
  const sales = [sale, { ...sale, qty: 2.5, product: { unit: " g " } },
    { ...sale, qty: 999, product: { unit: "UD" } }, { ...sale, qty: 999, product: { unit: "invalid" } },
    { ...sale, qty: 999, cancelledAt: now }, { ...sale, qty: 999, memberId: 18 },
    { ...sale, qty: 999, createdAt: new Date(start - 1) }, { ...sale, qty: 999, createdAt: end },
    { ...sale, qty: 0.25, createdAt: new Date(end - 1) }];
  const h = harness({ sales }), result = await body(h);
  assert.equal(result.consumption.monthlyGrams, 4);
  const rules = h.load("@/lib/sales-rules");
  assert.equal(rules.getMonthlyGramTotal([sales[0], sales[1], sales.at(-1)]), 4);
  const input = new Date(2026, 11, 31, 23, 59), original = input.getTime();
  const range = rules.getMonthRange(input);
  assert.equal(input.getTime(), original);
  assert.equal(range.start.getTime(), new Date(2026, 11, 1).getTime());
  assert.equal(range.end.getTime(), new Date(2027, 0, 1).getTime());
});

function checkHistoricalQuantities(rules) {
  const rows = (qty, unit = "G") => ({ qty, product: { unit } });
  assert.equal(rules.getMonthlyGramTotal([]), 0);
  assert.equal(rules.getMonthlyGramTotal([rows(0), rows(-2.5), rows(1.125, " g ")]), -1.375);
  assert.equal(rules.getMonthlyGramTotal([rows(0.1), rows(0.2)]), 0.1 + 0.2);
  assert.equal(rules.getMonthlyGramTotal([rows(9, ""), rows(9, "GRAMS"), rows(9, " ud ")]), 0);
  // Preserve the previous reducer's behavior for corrupt historical numeric values;
  // these are not valid new-sale inputs and are not silently clamped/defaulted.
  assert.ok(Number.isNaN(rules.getMonthlyGramTotal([rows(NaN)])));
  assert.equal(rules.getMonthlyGramTotal([rows(Infinity)]), Infinity);
  assert.equal(rules.getMonthlyGramTotal([rows(-Infinity)]), -Infinity);
}
test("extracted reducer preserves fractional, zero, negative and invalid historical values", () => {
  checkHistoricalQuantities(harness().load("@/lib/sales-rules"));
});

test("non-finite monthly totals return generic 500 instead of violating the numeric DTO", async () => {
  for (const qty of [NaN, Infinity, -Infinity]) {
    const h = harness({ sales: [{ memberId: 17, qty, product: { unit: "G" }, cancelledAt: null, createdAt: start }] });
    const response = await h.get();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "Error interno" });
  }
});

function checkCalendar(rules) {
  for (const [year, month, day] of [[2024, 1, 29], [2026, 2, 31], [2026, 9, 31], [2026, 11, 31]]) {
    const instant = new Date(year, month, day, 23, 59, 59, 999), before = instant.getTime();
    const range = rules.getMonthRange(instant);
    assert.equal(range.start.getTime(), new Date(year, month, 1).getTime());
    assert.equal(range.end.getTime(), new Date(year, month + 1, 1).getTime());
    assert.equal(instant.getTime(), before);
  }
}
test("extracted month keeps local calendar across leap year, DST months and year boundary", () => {
  const rules = harness().load("@/lib/sales-rules");
  checkCalendar(rules);
  const zone = process.env.OVERVIEW_EXPECTED_TZ;
  if (zone) {
    assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, zone);
    const range = rules.getMonthRange(new Date("2026-10-08T12:00:00Z"));
    assert.deepEqual([range.start.toISOString(), range.end.toISOString()], zone === "Europe/Madrid"
      ? ["2026-09-30T22:00:00.000Z", "2026-10-31T23:00:00.000Z"]
      : ["2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
  }
});

test("minimal sensitivity detects normalization, clamping and fixed-duration month regressions", () => {
  for (const [from, to, check] of [
    ['normalizeUnit(sale.product.unit) === "G"', 'sale.product.unit === "G"', checkHistoricalQuantities],
    ["total + sale.qty", "total + Math.max(0, sale.qty)", checkHistoricalQuantities],
    ["end.setMonth(end.getMonth() + 1);", "end.setDate(end.getDate() + 30);", checkCalendar],
  ]) {
    const rules = harness({ mutations: [{ file: "@/lib/sales-rules", from, to }] }).load("@/lib/sales-rules");
    assert.throws(() => check(rules), { name: "AssertionError" });
  }
});
test("DNI canonical wins even with unusable metadata, legacy is validated per member/side", async () => {
  const h = harness({ documents: [{ ...document, type: "ID_FRONT", storageKey: "" }],
    member: { dniFrontUrl: "PRIVATE_INVALID_REF", dniBackUrl: "members/17/dni-back.pdf" } });
  assert.deepEqual((await body(h)).documentation, { hasDniFront: true, hasDniBack: true });
  assert.equal(h.storageCalls, 0);
  for (const ref of ["members/18/dni-front.jpg", "members/17/dni-back.jpg", "https://evil.test/front.jpg", "garbage"]) {
    const result = await body(harness({ documents: [], member: { dniFrontUrl: ref, dniBackUrl: null } }));
    assert.deepEqual(result.documentation, { hasDniFront: false, hasDniBack: false });
  }
});
test("last event uses createdAt then id and preserves non-enum type without presence", async () => {
  const event = { id: 1, memberId: 17, type: "IN", createdAt: now };
  for (const type of ["OUT", "LEGACY_EVENT"]) {
    const result = await body(harness({ accesses: [event, { ...event, id: 2, type },
      { ...event, id: 90, createdAt: new Date(now - 1) }, { ...event, id: 99, memberId: 18 }] }));
    assert.deepEqual(result.access, { lastEvent: { type, createdAt: now.toISOString() } });
  }
});
test("invalid IDs and missing member stop before dependent reads, with private cache", async () => {
  const h = harness({ missing: true });
  for (const id of ["0", "017", "-1", "1.2", "1e2", "2147483648", "9007199254740993", "abc", ""]) {
    const response = await h.get(id);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "ID de socio inválido" });
  }
  assert.equal(h.reads.filter(r => r.name !== "auth").length, 0);
  const response = await h.get();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "Socio no encontrado" });
  assert.equal(h.reads.filter(r => r.name !== "auth").length, 1);
});
for (const failure of ["auth", "member", "contract", "sales", "document", "access"]) {
  test(`controlled infrastructure error: ${failure}`, async () => {
    const h = harness({ failure }), response = await h.get();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "Error interno" });
    assert.equal(h.storageCalls, 0);
  });
}

test("shared helpers are actually invoked once by overview and by operational-status", async () => {
  const h = harness(); await body(h);
  for (const key of ["getMemberOperationalFacts", "composeMemberOperationalStatus", "getMonthRange", "getMonthlyGramTotal"]) {
    assert.equal(h.calls.filter(c => c.key === key).length, 1, key);
  }
  const facts = h.calls.find(c => c.key === "getMemberOperationalFacts");
  const composition = h.calls.find(c => c.key === "composeMemberOperationalStatus");
  const month = h.calls.find(c => c.key === "getMonthRange");
  assert.equal(composition.args[0], facts.result);
  assert.equal(facts.args[2], month.args[0], "one instant for expiry and period");
  assert.equal(facts.args[1].id, contract.id);
  h.calls.length = 0;
  assert.equal((await h.get("17", "operational-status")).status, 200);
  for (const key of ["getMemberOperationalFacts", "composeMemberOperationalStatus"]) {
    assert.equal(h.calls.filter(c => c.key === key).length, 1, key);
  }
});

test("DNI presence matrix and canonical priority use the real resolver without Storage", async () => {
  for (const source of ["canonical", "legacy", "both"]) for (const front of [false, true]) for (const back of [false, true]) {
    const documents = [];
    for (const [present, type] of [[front, "ID_FRONT"], [back, "ID_BACK"]]) {
      if (present && source !== "legacy") documents.push({ ...document, type });
    }
    const h = harness({ documents, member: {
      dniFrontUrl: front && source !== "canonical" ? "members/17/dni-front.jpg" : null,
      dniBackUrl: back && source !== "canonical" ? "members/17/dni-back.pdf" : null,
    } });
    assert.deepEqual((await body(h)).documentation, { hasDniFront: front, hasDniBack: back });
    for (const call of h.calls.filter(c => c.key === "resolveMemberDni")) {
      const resolved = await call.result;
      const present = call.args[1] === "front" ? front : back;
      assert.equal(resolved?.source ?? null, present ? (source === "legacy" ? "legacy" : "new") : null);
    }
    assert.equal(h.storageCalls, 0);
  }
});

test("DNI canonical row selection is deterministic across timestamps, ids and other members", async () => {
  const h = harness({ documents: [
    { ...document, id: 1, storageKey: "older-id" },
    { ...document, id: 2, storageKey: "winner" },
    { ...document, id: 90, createdAt: new Date(now - 1), storageKey: "older-time" },
    { ...document, id: 99, memberId: 18, storageKey: "other-member" },
  ] });
  await body(h);
  const resolved = await h.calls.find(c => c.key === "resolveMemberDni" && c.args[1] === "back").result;
  assert.equal(resolved.storageKey, "winner");
});

test("finite historical consumption is informational even over limit and with negative quantities", async () => {
  for (const [quantities, expected] of [[[0], 0], [[-2.5, 1.125], -1.375], [[10.25, 25.5], 35.75]]) {
    const h = harness({ sales: quantities.map(qty => ({ memberId: 17, qty, product: { unit: " g " },
      cancelledAt: null, createdAt: now })) });
    const result = await body(h);
    assert.equal(result.consumption.monthlyGrams, expected);
    assert.equal(result.consumption.monthlyLimitG, 30);
    assert.equal(result.operational.canWithdraw, true, "monthly balance is not the basic eligibility rule");
    assert.equal(Object.hasOwn(result.consumption, "remainingGrams"), false);
  }
});

test("period follows request clock at local midnight, month/year boundaries and exact cuts", async () => {
  for (const boundary of [new Date(2026, 10, 1), new Date(2027, 0, 1)]) {
    const before = new Date(boundary - 1), after = new Date(+boundary + 1);
    const sales = [before, boundary, after].map(createdAt => ({ memberId: 17, qty: 1,
      product: { unit: "G" }, cancelledAt: null, createdAt }));
    for (const [instant, expected] of [[before, 1], [boundary, 2], [after, 2]]) {
      const result = await body(harness({ now: instant, sales }));
      assert.equal(result.consumption.monthlyGrams, expected);
      assert.equal(result.consumption.periodStart, new Date(instant.getFullYear(), instant.getMonth(), 1).toISOString());
      assert.equal(result.consumption.periodEndExclusive, new Date(instant.getFullYear(), instant.getMonth() + 1, 1).toISOString());
    }
  }
});

test("logical query count stays constant as monthly rows grow", async () => {
  for (const count of [0, 1, 1000]) {
    const h = harness({ sales: Array.from({ length: count }, () => ({ memberId: 17, qty: 0.25,
      product: { unit: "G" }, cancelledAt: null, createdAt: now })) });
    const result = await body(h);
    assert.equal(result.consumption.monthlyGrams, count * 0.25);
    assert.equal(h.reads.length, 7);
    assert.equal(h.storageCalls, 0);
  }
});

test("invalid ids never bypass authorization", async () => {
  for (const [options, status] of [[{ anonymous: true }, 401], [{ role: "MEMBER" }, 403]]) {
    const h = harness(options), response = await h.get("1e2");
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(h.reads.filter(r => r.name !== "auth").length, 0);
  }
});

test("DTO declarations exactly match both approved documents", () => {
  const dto = readFileSync(resolve(root, "lib/dtos/member-overview.ts"), "utf8").trim();
  for (const file of ["sprint-7.6.3.1-overview-design.md", "sprint-7.6.3.2-overview-implementation.md"]) {
    const document = readFileSync(resolve(root, "docs", file), "utf8");
    const block = document.match(/```ts\r?\n(export interface MemberOverviewDTO[\s\S]*?)\r?\n```/);
    assert.ok(block, file);
    assert.equal(block[1].replaceAll("\r\n", "\n").trim(), dto.replaceAll("\r\n", "\n"));
  }
});
