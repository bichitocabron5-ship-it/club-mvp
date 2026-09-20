// Run: node scripts/test-access-operational-status.mjs
// Real POST, operational helper, RFID normalizer and NextResponse. Only auth,
// Prisma, storage and time are controlled. This does not prove PostgreSQL locks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const routePath = "app/api/access/toggle/route.ts";
const source = readFileSync(new URL(routePath, root), "utf8");
const epoch = Date.parse("2026-09-20T12:00:00.000Z");
const past = () => new Date(epoch - 1);
const future = () => new Date(epoch + 60_000);
const plain = value => JSON.parse(JSON.stringify(value));
const errors = {
  MEMBER_INACTIVE: "Socio inactivo",
  CONTRACT_REQUIRED: "Contrato no firmado",
  MEMBERSHIP_EXPIRED: "Membresia caducada",
  RFID_ASSIGNMENT_CHANGED: "La chapita ya no está asignada a este socio. No se ha registrado ningún acceso. Vuelve a escanear.",
  MEMBER_NOT_FOUND: "Socio no encontrado",
  ACCESS_CONFLICT: "Conflicto de acceso. Comprueba el estado antes de volver a escanear.",
  INTERNAL_ERROR: "No se pudo confirmar el resultado del acceso. Comprueba el estado antes de repetir.",
};

function harness(options = {}) {
  const member = options.missing ? null : {
    id: 17, memberNumber: "42", fullName: "Locked member", dni: "DOC17",
    photoUrl: "private/photo", active: true, expiresAt: future(), rfidCode: "TAG17",
    ...options.member,
  };
  const contracts = options.contracts ?? [{ id: 8, consumptionGrams: 30 }];
  const lastLog = options.lastLog ?? null;
  const events = [];
  const logs = [];
  const factsCalls = [];
  let inTransaction = false;
  let contractResolved = false;
  let appNow = epoch;
  let infrastructureAssertion;
  class ControlledDate extends Date {
    constructor(...args) {
      if (args.length === 0) events.push("now");
      super(...(args.length ? args : [appNow]));
    }
    static now() { throw new Error("Unexpected Date.now()"); }
  }
  const tx = {
    async $queryRaw(strings, ...values) {
      assert.equal(inTransaction, true);
      const sql = strings.join("?").replace(/\s+/g, " ").trim();
      if (sql.includes('FROM "Member"')) {
        events.push("lock");
        assert.equal(sql, 'SELECT "id", "memberNumber", "fullName", "dni", "photoUrl", "active", "expiresAt", "rfidCode" FROM "Member" WHERE "id" = ? FOR UPDATE');
        assert.deepEqual(values, [17]);
        return member ? [member] : [];
      }
      events.push("db-clock");
      assert.equal(sql, 'SELECT clock_timestamp() AS "now"');
      assert.deepEqual(values, []);
      return [{ now: new Date(options.dbNow ?? epoch + 100) }];
    },
    memberContract: {
      async findFirst(args) {
        events.push("contract");
        assert.equal(inTransaction, true);
        assert.equal(events.at(-2), "lock");
        assert.deepEqual(plain(args), {
          where: { memberId: 17 }, select: { id: true, consumptionGrams: true },
        });
        if (options.contractError) throw options.contractError;
        // Simulate time passing while awaiting the existing transaction query.
        await Promise.resolve();
        appNow += options.contractDelay ?? 0;
        contractResolved = true;
        return contracts[0] ?? null;
      },
    },
    accessLog: {
      async findFirst(args) {
        events.push("last-log");
        assert.equal(inTransaction, true);
        assert.deepEqual(plain(args), {
          where: { memberId: 17 }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return lastLog;
      },
      async create({ data }) {
        events.push("create");
        assert.equal(inTransaction, true);
        assert.deepEqual(Object.keys(data).sort(), ["createdAt", "memberId", "type"]);
        if (options.createError) throw options.createError;
        const log = { id: 91, ...data };
        logs.push(log);
        return log;
      },
    },
  };
  const prisma = {
    async $transaction(callback, config) {
      events.push("transaction");
      try {
        assert.deepEqual(plain(config), { isolationLevel: "ReadCommitted" });
        inTransaction = true;
        const result = await callback(tx);
        events.push("commit");
        return result;
      } catch (error) {
        if (error instanceof assert.AssertionError) infrastructureAssertion = error;
        logs.length = 0;
        events.push("rollback");
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  };
  const mocks = {
    "@/lib/auth-server": {
      async requireStaffOrAdmin() {
        events.push("auth");
        return options.auth ?? { ok: true, session: { user: { id: "1", role: "STAFF" } } };
      },
    },
    "@/lib/prisma": { prisma },
    "@/lib/storage": {
      async resolveStorageUrlForResponse(url, config) {
        events.push("photo");
        assert.equal(inTransaction, false);
        assert.equal(config.context, "api/access/toggle");
        if (options.photoError) throw options.photoError;
        return url ? "https://example.invalid/signed-photo" : null;
      },
    },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = new URL(`${name.slice(2)}.ts`, root);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require: load, Date: ControlledDate }, { filename: filename.pathname });
    if (name === "@/lib/member-operational-status") {
      // Observe inputs while executing the real helper unchanged; never fake facts.
      exports.getMemberOperationalFacts = new Proxy(exports.getMemberOperationalFacts, {
        apply(target, receiver, args) {
          events.push("facts");
          assert.equal(inTransaction, true);
          assert.equal(contractResolved, true);
          assert.equal(events.at(-2), "now");
          const [input, contract, now] = args;
          assert.deepEqual(Object.keys(input).sort(), ["active", "expiresAt", "rfidCode"]);
          assert.equal(input.active, member.active);
          assert.equal(input.expiresAt, member.expiresAt);
          assert.equal(input.rfidCode, member.rfidCode);
          assert.deepEqual(plain(contract), contracts[0] ?? null);
          assert.equal(now.getTime(), appNow);
          factsCalls.push(args);
          return Reflect.apply(target, receiver, args);
        },
      });
    }
    cache.set(name, exports);
    return exports;
  }
  const { POST } = load("@/app/api/access/toggle/route");
  return {
    member, events, logs, factsCalls,
    async post(body = { memberId: 17, rfidCode: "TAG17" }, raw = false) {
      const response = await POST(new Request("http://localhost/api/access/toggle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: raw ? body : JSON.stringify(body),
      }));
      if (infrastructureAssertion) throw infrastructureAssertion;
      return { status: response.status, body: await response.json() };
    },
  };
}

let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
function rejection(result, code, status = 409, error = errors[code]) {
  assert.deepEqual(result, { status, body: { code, error } });
}
const early = ["auth", "transaction", "lock", "commit"];
const operational = ["auth", "transaction", "lock", "contract", "now", "facts", "commit"];
const success = [...operational.slice(0, -1), "last-log", "db-clock", "create", "commit", "photo"];

await test("A/P/Q success: locked projections, tx-only queries and complete HTTP response", async () => {
  const h = harness();
  const result = await h.post({ memberId: 17, rfidCode: " T A G17\n" });
  const createdAt = new Date(epoch + 100).toISOString();
  assert.deepEqual(result, { status: 200, body: {
    log: { id: 91, memberId: 17, type: "IN", createdAt }, action: "IN", message: "Entrada registrada",
    member: { ...h.member, displayNumber: "42", expiresAt: h.member.expiresAt.toISOString(), photoUrl: "https://example.invalid/signed-photo" },
    lastAccess: { id: 91, type: "IN", createdAt },
  } });
  assert.deepEqual(h.events, success);
  assert.equal(h.logs.length, 1);
  assert.equal(h.factsCalls.length, 1);
});

for (const [name, options, code, stages] of [
  ["B inactive", { member: { active: false }, contractError: new Error("Must not query") }, "MEMBER_INACTIVE", early],
  ["C expired", { member: { expiresAt: past() } }, "MEMBERSHIP_EXPIRED", operational],
  ["D no contract", { contracts: [] }, "CONTRACT_REQUIRED", operational],
  ["H revoked RFID", { member: { rfidCode: null } }, "RFID_ASSIGNMENT_CHANGED", early],
  ["I reassigned RFID, no owner disclosure", { member: { rfidCode: "REPLACEMENT" } }, "RFID_ASSIGNMENT_CHANGED", early],
  ["J inactive + expired", { member: { active: false, expiresAt: past() } }, "MEMBER_INACTIVE", early],
  ["inactive + no contract", { member: { active: false }, contracts: [] }, "MEMBER_INACTIVE", early],
  ["K expired + no contract", { member: { expiresAt: past() }, contracts: [] }, "CONTRACT_REQUIRED", operational],
  ["L all operational blocks", { member: { active: false, expiresAt: past() }, contracts: [] }, "MEMBER_INACTIVE", early],
  ["L RFID mismatch + all blocks", { member: { rfidCode: null, active: false, expiresAt: past() }, contracts: [] }, "RFID_ASSIGNMENT_CHANGED", early],
]) {
  await test(`${name}; O/P/Q no write and exact query sequence`, async () => {
    const h = harness(options);
    rejection(await h.post(), code);
    assert.equal(h.logs.length, 0);
    assert.equal(h.factsCalls.length, stages === early ? 0 : 1);
    assert.deepEqual(h.events, stages);
  });
}

for (const [name, options] of [
  ["E null expiry", { member: { expiresAt: null } }],
  ["F exact expiry equality with fixed clock", { member: { expiresAt: new Date(epoch) } }],
  ["G null contract limit", { contracts: [{ id: 8, consumptionGrams: null }] }],
  ["G zero contract limit", { contracts: [{ id: 8, consumptionGrams: 0 }] }],
  ["multiple contracts, existing findFirst without orderBy", { contracts: [{ id: 2, consumptionGrams: null }, { id: 99, consumptionGrams: 10 }] }],
]) {
  await test(name, async () => {
    const h = harness(options);
    assert.equal((await h.post()).status, 200);
    assert.equal(h.logs.length, 1);
    assert.equal(h.factsCalls.length, 1);
    assert.deepEqual(h.events, success);
  });
}

await test("now is captured after the awaited contract query", async () => {
  const h = harness({ member: { expiresAt: new Date(epoch + 1) }, contractDelay: 2 });
  rejection(await h.post(), "MEMBERSHIP_EXPIRED");
  assert.deepEqual(h.events, operational);
  assert.equal(h.factsCalls[0][2].getTime(), epoch + 2);
});

for (const [name, previous, action, message] of [
  ["M previous IN", "IN", "OUT", "Salida registrada"],
  ["N previous OUT", "OUT", "IN", "Entrada registrada"],
  ["N no history", null, "IN", "Entrada registrada"],
]) {
  await test(name, async () => {
    const h = harness({ lastLog: previous ? { id: 90, type: previous, createdAt: new Date(epoch - 10) } : null });
    const result = await h.post();
    assert.equal(result.status, 200);
    assert.equal(result.body.action, action);
    assert.equal(result.body.message, message);
    assert.equal(result.body.log.type, action);
    assert.equal(h.logs[0].type, action);
    assert.deepEqual(h.events, success);
  });
}

for (const [label, dbNow, expected] of [["DB behind", epoch - 5, epoch + 1], ["DB equal", epoch, epoch + 1], ["DB ahead", epoch + 100, epoch + 100]]) {
  await test(`monotonic timestamp: ${label}`, async () => {
    const h = harness({ dbNow, lastLog: { id: 90, type: "IN", createdAt: new Date(epoch) } });
    const result = await h.post();
    assert.equal(result.status, 200);
    assert.equal(h.logs[0].createdAt.getTime(), expected);
    assert.equal(result.body.lastAccess.createdAt, new Date(expected).toISOString());
  });
}

for (const [name, body, error, raw = false] of [
  ["only memberId", { memberId: 17 }, "Socio o código RFID inválido"],
  ["only RFID", { rfidCode: "TAG17" }, "Socio o código RFID inválido"],
  ["empty normalized RFID", { memberId: 17, rfidCode: " \n\t" }, "Código RFID inválido"],
  ["invalid JSON", "{", "JSON inválido", true],
  ["null payload", null, "Datos inválidos"],
  ["array payload", [], "Datos inválidos"],
  ["invalid member ID", { memberId: 0, rfidCode: "TAG17" }, "Socio o código RFID inválido"],
]) {
  await test(`payload ${name}`, async () => {
    const h = harness();
    rejection(await h.post(body, raw), "INVALID_PAYLOAD", 400, error);
    assert.deepEqual(h.events, ["auth"]);
  });
}

await test("Member not found", async () => {
  const h = harness({ missing: true });
  rejection(await h.post(), "MEMBER_NOT_FOUND", 404);
  assert.deepEqual(h.events, early);
  assert.equal(h.factsCalls.length, 0);
});
for (const [status, code] of [[401, "UNAUTHORIZED"], [403, "FORBIDDEN"]]) {
  await test(`auth ${status} precedes JSON parsing`, async () => {
    const h = harness({ auth: { ok: false, status, error: code } });
    rejection(await h.post("{", true), code, status, code);
    assert.deepEqual(h.events, ["auth"]);
  });
}
for (const failure of [{ code: "P2034" }, { code: "40001" }, { cause: { driverAdapterError: { originalCode: "40P01" } } }]) {
  await test(`ACCESS_CONFLICT ${JSON.stringify(failure)}`, async () => {
    const h = harness({ createError: failure });
    rejection(await h.post(), "ACCESS_CONFLICT");
    assert.equal(h.logs.length, 0);
    assert.equal(h.events.at(-1), "rollback");
  });
}
await test("INTERNAL_ERROR rolls back a failed contract query", async () => {
  const h = harness({ contractError: new Error("private database detail") });
  rejection(await h.post(), "INTERNAL_ERROR", 500);
  assert.deepEqual(h.events, ["auth", "transaction", "lock", "contract", "rollback"]);
  assert.equal(h.logs.length, 0);
});
await test("post-commit error is not reported as rolled-back ACCESS_CONFLICT", async () => {
  const h = harness({ photoError: { code: "P2034" } });
  rejection(await h.post(), "INTERNAL_ERROR", 500);
  assert.equal(h.logs.length, 1);
  assert.deepEqual(h.events, success);
});

await test("core owns contract and expiry facts; active remains an early guard", () => {
  assert.match(source, /import \{ getMemberOperationalFacts \} from "@\/lib\/member-operational-status"/);
  assert.equal((source.match(/getMemberOperationalFacts\(/g) ?? []).length, 1);
  assert.match(source, /if \(!facts\.hasContract\)/);
  assert.match(source, /if \(facts\.expired\)/);
  assert.doesNotMatch(source, /member\.expiresAt\s*(?:<|>|\.getTime)|canAccess|if\s*\(!contract\)|(?:const|let)\s+hasContract/);
  assert.ok(source.indexOf("if (!member.active)") < source.indexOf("await tx.memberContract.findFirst"));
});

await test("R/S scope review: current, auto-checkout, UI and core unchanged from HEAD", () => {
  // Sprint scope assertion, separate from behavioral coverage; no database access.
  const paths = ["lib/member-operational-status.ts", "lib/access.ts", "app/api/access/current/route.ts", "app/api/access/auto-checkout/route.ts", "app/access/page.tsx"];
  const diff = execFileSync("git", ["diff", "HEAD", "--", ...paths], { cwd: root, encoding: "utf8" });
  assert.equal(diff, "");
});
console.log(`${checks} checks passed against the production Access POST and operational helper.`);
