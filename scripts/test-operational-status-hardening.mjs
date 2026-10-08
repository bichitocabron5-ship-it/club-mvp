// Production route, persisted authorization and facts; no database/network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const now = new Date("2026-10-08T12:00:00Z");
const plain = value => JSON.parse(JSON.stringify(value));
const member = {
  id: 17, memberNumber: "A17", fullName: "Socio", active: true, expiresAt: null,
  rfidCode: "PRIVATE_TAG", commercialProfile: "STANDARD", discountPercent: 10,
  dni: "PRIVATE_DNI", phone: "PRIVATE_PHONE", email: "PRIVATE_EMAIL",
  commercialNotes: "PRIVATE_NOTES", photoUrl: "storage://PRIVATE_PHOTO",
  dniFrontUrl: "storage://PRIVATE_FRONT", dniBackUrl: "storage://PRIVATE_BACK",
  joinedAt: now, createdAt: now, futureSensitiveField: "PRIVATE_FUTURE",
};
function harness(options = {}) {
  const state = { role: "STAFF", active: true, ...options };
  const reads = { auth: 0, member: 0, contract: 0 };
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => state.anonymous ? null : { user: { id: "1", role: state.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/prisma": { prisma: {
      appUser: { findUnique: async () => {
        reads.auth++;
        return state.missingUser ? null : { id: 1, role: state.role, active: state.active };
      } },
      member: { findUnique: async query => {
        reads.member++;
        if (state.prismaFailure) throw state.prismaFailure;
        assert.deepEqual(plain(query), { where: { id: 17 }, select: {
          id: true, memberNumber: true, fullName: true, active: true, expiresAt: true,
          rfidCode: true, commercialProfile: true, discountPercent: true,
        } });
        // Return extra fields deliberately: response whitelist must hold independently.
        return state.missing ? null : { ...member, ...state.member };
      } },
      memberContract: { findFirst: async query => {
        reads.contract++;
        assert.deepEqual(plain(query), { where: { memberId: 17 },
          orderBy: [{ signedAt: "desc" }, { id: "desc" }], select: { id: true, consumptionGrams: true } });
        return state.contract === undefined ? { id: 2, consumptionGrams: 30 } : state.contract;
      } },
    } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, `${name.slice(2)}.ts`);
    const exports = {};
    cache.set(name, exports);
    let source = readFileSync(filename, "utf8");
    if (name === "@/app/api/members/[id]/operational-status/route") {
      for (const { from, to } of JSON.parse(process.env.OPERATIONAL_STATUS_MUTATIONS ?? "[]")) {
        assert.ok(source.includes(from), `Mutation anchor missing: ${from}`);
        source = source.replaceAll(from, to);
      }
    }
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
    vm.runInNewContext(code, { exports, require: load, Response, Request, Date: Clock }, { filename });
    return exports;
  }
  return { state, reads, get: (id = "17") => load("@/app/api/members/[id]/operational-status/route").GET(
    new Request("http://test/status"), { params: Promise.resolve({ id }) }) };
}
for (const [name, options, status] of [
  ["anonymous", { anonymous: true }, 401], ["persisted MEMBER despite ADMIN JWT", { role: "MEMBER" }, 403],
  ["persisted inactive", { active: false }, 401], ["persisted user missing", { missingUser: true }, 401],
  ["STAFF", { role: "STAFF", jwtRole: "MEMBER" }, 200], ["ADMIN", { role: "ADMIN", jwtRole: "MEMBER" }, 200],
]) {
  test(name, async () => {
    const h = harness(options), response = await h.get();
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(h.reads.auth, options.anonymous ? 0 : 1);
    if (status !== 200) {
      assert.deepEqual(await response.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
      assert.equal(h.reads.member + h.reads.contract, 0);
    }
  });
}
test("persisted revocation applies on next request", async () => {
  const h = harness();
  assert.equal((await h.get()).status, 200);
  h.state.active = false;
  assert.equal((await h.get()).status, 401);
  h.state.active = true; h.state.role = "MEMBER";
  assert.equal((await h.get()).status, 403);
  assert.equal(h.reads.member, 1);
});
test("exact allowlisted DTO retains TPV identity/discount without private fields", async () => {
  const body = await (await harness().get()).json();
  assert.deepEqual(body, {
    member: { id: 17, memberNumber: "A17", fullName: "Socio", active: true, expiresAt: null,
      commercialProfile: "STANDARD", discountPercent: 10 },
    hasContract: true, contract: { monthlyLimitG: 30 }, expired: false, canWithdraw: true,
    reasons: { inactive: false, noContract: false, expired: false },
  });
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|storage:|dni|phone|email|commercialNotes|rfidCode|photoUrl|joinedAt|createdAt/);
});
for (const [name, override, contract, expired, allowed] of [
  ["inactive", { active: false }, undefined, false, false],
  ["expired", { expiresAt: new Date(now.getTime() - 1) }, undefined, true, false],
  ["equality", { expiresAt: now }, undefined, false, true],
  ["future", { expiresAt: new Date(now.getTime() + 1) }, undefined, false, true],
  ["no contract", {}, null, false, false],
  ["null limit", {}, { id: 3, consumptionGrams: null }, false, true],
  ["no RFID", { rfidCode: null }, undefined, false, true],
]) {
  test(`unchanged facts: ${name}`, async () => {
    const body = await (await harness({ member: override, contract }).get()).json();
    assert.equal(body.expired, expired);
    assert.equal(body.canWithdraw, allowed);
    assert.equal(body.hasContract, contract !== null);
    assert.equal(body.member.active, override.active ?? true);
    assert.equal(body.member.expiresAt, override.expiresAt?.toISOString() ?? null);
    assert.deepEqual(body.reasons, { inactive: override.active === false, expired, noContract: contract === null });
  });
}
test("handled errors remain private and no-store", async () => {
  for (const [h, id, status] of [[harness(), "0", 400], [harness({ missing: true }), "17", 404]]) {
    const response = await h.get(id);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("Prisma exception still propagates; no success DTO is fabricated", async () => {
  const failure = new Error("controlled database failure");
  const h = harness({ prismaFailure: failure });
  await assert.rejects(h.get(), error => error === failure);
  assert.equal(h.reads.contract, 0);
});
