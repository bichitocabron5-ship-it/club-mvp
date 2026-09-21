// Real Sales engine, HTTP handlers and facts helper; isolated Prisma/auth/clock.
// Run: node scripts/test-sales-operational-status.mjs
// PostgreSQL lock scheduling and foreign-key enforcement are not simulated.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const instant = Date.parse("2026-09-20T12:00:00.000Z");
const past = new Date(instant - 1);
const future = new Date(instant + 1);
const key = "12345678-1234-4234-8234-123456789abc";
let checks = 0;
async function test(name, fn) {
  await fn(); checks++; console.log(`PASS ${name}`);
}

function harness(options = {}) {
  const events = [];
  let clock = instant - 1000;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const member = {
    id: 1, fullName: "Test member", active: true, expiresAt: future,
    rfidCode: "TAG", commercialProfile: "STANDARD", discountPercent: 0,
    ...options.member,
  };
  const selectedContract = options.contract === undefined
    ? { id: 42, consumptionGrams: 30 } : options.contract;
  const state = { member, contract: selectedContract, operations: [], sales: [], moves: [], cash: [], stock: options.stock ?? 100 };
  const auth = { ok: true, session: { user: { id: "1", email: null } } };
  const contractQuery = async args => {
    events.push("contract");
    assert.deepEqual(plain(args), {
      where: { memberId: 1 }, select: { id: true, consumptionGrams: true },
      orderBy: { signedAt: "desc" },
    });
    // Time crosses expiry while awaiting data. An early captured now would fail.
    clock = instant;
    return state.contract;
  };
  const memberQuery = async (args, transactional) => {
    events.push("member");
    assert.deepEqual(plain(args), transactional ? {
      where: { id: 1 }, select: {
        id: true, fullName: true, active: true, expiresAt: true,
        rfidCode: true, commercialProfile: true, discountPercent: true,
      },
    } : { where: { id: 1 } });
    return options.missingMember ? null : state.member;
  };
  const prisma = {
    member: { findUnique: args => memberQuery(args, false) },
    memberContract: { findFirst: contractQuery },
    saleOperation: { findUnique: async ({ where }) => {
      events.push("replay");
      const scope = where.operatorUserId_idempotencyKey;
      return state.operations.find(op => op.operatorUserId === scope.operatorUserId && op.idempotencyKey === scope.idempotencyKey) ?? null;
    } },
    async $transaction(fn, config) {
      events.push("tx");
      assert.equal(config.isolationLevel, "Serializable");
      const draft = structuredClone(state);
      const tx = {
        $queryRaw: async (sql, id) => {
          events.push("lock");
          assert.match(sql.join("?"), /SELECT "rfidCode" FROM "Member" WHERE "id" = \? FOR UPDATE/);
          assert.equal(id, 1);
          return options.missingMember ? [] : [{ rfidCode: state.member.rfidCode }];
        },
        saleOperation: {
          create: async ({ data }) => {
            events.push("operation.create");
            const op = { id: draft.operations.length + 1, ...data };
            draft.operations.push(op); return op;
          },
          update: async ({ where, data }) => {
            events.push("operation.update");
            Object.assign(draft.operations.find(op => op.id === where.id), data);
          },
        },
        dayClosure: { findUnique: async () => { events.push("closure"); return options.closed ? { status: "CLOSED" } : null; } },
        member: { findUnique: args => memberQuery(args, true) },
        memberContract: { findFirst: contractQuery },
        product: {
          findMany: async () => {
            events.push("products");
            return [{ id: 1, active: true, name: "Product", unit: "G", price: 1, stock: draft.stock, averageCost: 0 }];
          },
          updateMany: async ({ where, data }) => {
            events.push("stock");
            if (draft.stock < where.stock.gte) return { count: 0 };
            draft.stock -= data.stock.decrement; return { count: 1 };
          },
        },
        sale: {
          findMany: async ({ where }) => {
            const monthly = !!where.createdAt.lt;
            events.push(monthly ? "month" : "today");
            assert.equal(where.memberId, 1); assert.equal(where.cancelledAt, null);
            return [{ qty: monthly ? (options.monthG ?? 0) : (options.todayG ?? 0), product: { unit: "G" } }];
          },
          create: async ({ data, select }) => {
            events.push("sale");
            const sale = { id: draft.sales.length + 1, ...data, createdAt: new Date(instant), updatedAt: new Date(instant), cancelledAt: null, cancelledByUserId: null, cancelReason: null };
            draft.sales.push(sale);
            return Object.fromEntries(Object.keys(select).map(field => [field, sale[field]]));
          },
        },
        stockMove: { create: async ({ data }) => { events.push("move"); draft.moves.push(data); } },
        cashMove: { create: async ({ data }) => { events.push("cash"); draft.cash.push(data); } },
      };
      const result = await fn(tx);
      Object.assign(state, draft);
      return result;
    },
  };
  const mocks = {
    "@/lib/prisma": { prisma },
    "@/lib/auth-server": { requireAuth: async () => auth, requireStaffOrAdmin: async () => auth },
    "@/lib/club-settings": { getClubSettings: async () => { events.push("settings"); return { dailyLimitG: 10, dailyLimitUd: 15 }; } },
    "@/lib/audit": { createAuditLog: async () => { events.push("audit"); } },
    "next/server": { NextResponse: Response },
  };
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
    vm.runInNewContext(code, { exports, require: load, Date: Clock, console, Buffer, Request, Response, SyntaxError }, { filename });
    if (name === "@/lib/member-operational-status") {
      const real = exports.getMemberOperationalFacts;
      exports.getMemberOperationalFacts = (input, contract, now) => {
        events.push("core");
        assert.equal(events.at(-2), "contract", "No query or core before contract resolves");
        assert.equal(now.getTime(), instant, "Clock captured after contract query");
        assert.deepEqual(plain(input), plain({ active: state.member.active, expiresAt: state.member.expiresAt, rfidCode: state.member.rfidCode }));
        assert.deepEqual(plain(contract), plain(state.contract), "Use exactly the selected contract projection");
        const before = plain({ input, contract, now });
        const facts = real(input, contract, now);
        assert.deepEqual(plain({ input, contract, now }), before);
        return facts;
      };
    }
    return exports;
  }
  return {
    state, events, auth,
    async post(type = "BULK", extra = {}) {
      const body = type === "SINGLE" ? { memberId: 1, productId: 1, qty: 1 } : { memberId: 1, items: [{ productId: 1, qty: 1 }] };
      const route = load(type === "SINGLE" ? "@/app/api/sales/route" : "@/app/api/sales/bulk/route");
      return route.POST(new Request("http://test/api/sales", { method: "POST", body: JSON.stringify({ ...body, ...extra }) }));
    },
    async get(id = "1") {
      return load("@/app/api/members/[id]/operational-status/route").GET(new Request("http://test/status"), { params: Promise.resolve({ id }) });
    },
  };
}

async function expectResponse(response, status, error, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  if (error) assert.equal(body.error, error);
  if (code) assert.equal(body.code, code);
  return body;
}

const salesCases = [
  ["A future", {}, 200],
  ["B no expiry", { member: { expiresAt: null } }, 200],
  ["C expired", { member: { expiresAt: past } }, 400, "Membresía caducada"],
  ["D inactive", { member: { active: false } }, 400, "Socio no activo"],
  ["E no contract", { contract: null }, 400, "El socio no ha firmado el contrato"],
  ["F equality", { monthG: 29 }, 200],
  ["F excess", { monthG: 30 }, 400, "Limite mensual de gramos superado (30 g)"],
  ["G null limit", { contract: { id: 7, consumptionGrams: null }, monthG: 1000 }, 200],
  ["H manual without RFID", { member: { rfidCode: null } }, 200],
  ["L inactive and expired", { member: { active: false, expiresAt: past } }, 400, "Socio no activo"],
  ["M expired without contract", { member: { expiresAt: past }, contract: null }, 400, "Membresía caducada"],
  ["N inactive without contract", { member: { active: false }, contract: null }, 400, "Socio no activo"],
  ["zero is a contract", { contract: { id: 8, consumptionGrams: 0 } }, 400, "Limite mensual de gramos superado (0 g)"],
  ["null still enforces daily limit", { contract: { id: 7, consumptionGrams: null }, todayG: 10 }, 400, "Limite diario de gramos superado (10 g)"],
  ["stock precedes monthly", { stock: 0, monthG: 30 }, 400, "Stock insuficiente: Product"],
  ["null still enforces stock", { stock: 0, contract: { id: 7, consumptionGrams: null } }, 400, "Stock insuficiente: Product"],
  ["exact expiry equality", { member: { expiresAt: new Date(instant) } }, 200],
  ["missing member", { missingMember: true }, 400, "Socio no encontrado"],
];
for (const type of ["SINGLE", "BULK"]) {
  for (const [name, options, status, message] of salesCases) {
    await test(`Sales ${type} / V: ${name}`, async () => {
      const h = harness(options);
      await expectResponse(await h.post(type), status, message, status === 400 ? "SALE_VALIDATION_ERROR" : undefined);
      assert.deepEqual(h.events.filter(e => ["member", "contract"].includes(e)), ["member", "contract"]);
      assert.ok(!h.events.includes("lock"));
      assert.equal(h.events.includes("core"), !options.missingMember && options.member?.active !== false);
      if (status !== 200) assert.equal(h.state.sales.length, 0);
      if (name === "A future") assert.deepEqual(h.events, ["tx", "closure", "member", "contract", "core", "products", "settings", "today", "month", "stock", "sale", "move", "cash", "audit"]);
    });
  }
  for (const [name, rfid, status] of [["I valid", "TAG", 200], ["J revoked", null, 409], ["K reassigned", "OTHER", 409]]) {
    await test(`Sales ${type}: RFID ${name}`, async () => {
      const h = harness({ member: { rfidCode: rfid } });
      await expectResponse(await h.post(type, { expectedRfidCode: "TAG", idempotencyKey: key }), status,
        status === 409 ? "La identificación RFID ya no es válida. Identifica de nuevo al socio." : undefined,
        status === 409 ? "RFID_ASSIGNMENT_CHANGED" : undefined);
      assert.deepEqual(h.events.slice(0, 4), ["replay", "tx", "lock", "operation.create"]);
      if (status === 409) {
        assert.equal(h.events.length, 4);
        assert.equal(h.state.operations.length, 0);
      }
    });
  }
}

await test("RFID mismatch wins over closure, inactive, expired, contract and limits", async () => {
  const h = harness({ closed: true, member: { rfidCode: null, active: false, expiresAt: past }, contract: null, stock: 0, monthG: 30 });
  await expectResponse(await h.post("BULK", { expectedRfidCode: "TAG" }), 409, undefined, "RFID_ASSIGNMENT_CHANGED");
  assert.deepEqual(h.events, ["tx", "lock"]);
});

for (const [name, change] of [
  ["O inactive", h => { h.state.member.active = false; }],
  ["P expired", h => { h.state.member.expiresAt = past; }],
  ["Q revoked", h => { h.state.member.rfidCode = null; }],
  ["no contract", h => { h.state.contract = null; }],
  ["reassigned", h => { h.state.member.rfidCode = "OTHER"; }],
  ["all ineligible", h => { Object.assign(h.state.member, { active: false, expiresAt: past, rfidCode: null }); h.state.contract = null; }],
]) {
  await test(`Replay ${name}: no tx, queries, core, lock or writes`, async () => {
    const h = harness();
    const payload = { expectedRfidCode: "TAG", idempotencyKey: key };
    const original = await expectResponse(await h.post("BULK", payload), 200);
    change(h); h.events.length = 0;
    const before = plain(h.state);
    assert.deepEqual(await expectResponse(await h.post("BULK", payload), 200), original);
    assert.deepEqual(h.events, ["replay"]);
    assert.deepEqual(plain(h.state), before);
  });
}

await test("R new key with revoked evidence rejects; S payload/type conflict precedes state", async () => {
  const h = harness();
  await expectResponse(await h.post("BULK", { expectedRfidCode: "TAG", idempotencyKey: key }), 200);
  h.state.member.rfidCode = null;
  await expectResponse(await h.post("BULK", { expectedRfidCode: "TAG", idempotencyKey: "22345678-1234-4234-8234-123456789abc" }), 409, undefined, "RFID_ASSIGNMENT_CHANGED");
  for (const [type, extra] of [["SINGLE", {}], ["BULK", { items: [{ productId: 1, qty: 2 }] }]]) {
    h.events.length = 0;
    await expectResponse(await h.post(type, { expectedRfidCode: "TAG", idempotencyKey: key, ...extra }), 409, undefined, "IDEMPOTENCY_CONFLICT");
    assert.deepEqual(h.events, ["replay"]);
  }
});

const statusCases = [
  ["A no expiry", { member: { expiresAt: null } }, true, false, true, false],
  ["B future", {}, true, false, true, false],
  ["C expired", { member: { expiresAt: past } }, true, true, false, false],
  ["D inactive", { member: { active: false } }, true, false, false, true],
  ["E no contract", { contract: null }, false, false, false, false],
  ["F null limit", { contract: { id: 77, consumptionGrams: null } }, true, false, true, false],
  ["G RFID null", { member: { rfidCode: null } }, true, false, true, false],
  ["H RFID present", { member: { rfidCode: "OTHER" } }, true, false, true, false],
  ["I exact equality", { member: { expiresAt: new Date(instant) } }, true, false, true, false],
];
for (const [name, options, hasContract, expired, canWithdraw, inactive] of statusCases) {
  await test(`Operational-status ${name}: exact DTO`, async () => {
    const h = harness(options);
    assert.deepEqual(await expectResponse(await h.get(), 200), {
      member: plain(h.state.member), hasContract,
      contract: hasContract ? { monthlyLimitG: options.contract === undefined ? 30 : options.contract.consumptionGrams } : null,
      expired, canWithdraw, reasons: { inactive, noContract: !hasContract, expired },
    });
    assert.deepEqual(h.events, ["member", "contract", "core"]);
  });
}
await test("Operational-status auth, ID and missing member remain unchanged", async () => {
  const denied = harness(); Object.assign(denied.auth, { ok: false, status: 401, error: "UNAUTHORIZED" });
  await expectResponse(await denied.get(), 401, "UNAUTHORIZED"); assert.deepEqual(denied.events, []);
  const invalid = harness();
  await expectResponse(await invalid.get("0"), 400, "ID inválido"); assert.deepEqual(invalid.events, []);
  const missing = harness({ missingMember: true });
  await expectResponse(await missing.get(), 404, "Socio no encontrado"); assert.deepEqual(missing.events, ["member"]);
});
console.log(`${checks} checks passed. T (uncertain K) and additional U/operator/concurrency coverage: run test-sales-rfid.mjs.`);
