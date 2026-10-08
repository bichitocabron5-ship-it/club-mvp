import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const fields = ["id", "memberNumber", "fullName", "dni", "phone", "active", "expiresAt"];
const row = { id: 17, memberNumber: "0017", fullName: "Socio Uno", dni: "DOC17", phone: "123",
  active: true, expiresAt: null, rfidCode: "SECRET_TAG", contracts: [{ id: 2, consumptionGrams: 20 }],
  commercialNotes: "SECRET_NOTES", commercialProfile: "SPECIAL", discountPercent: 20,
  photoUrl: "storage://SECRET_PHOTO", dniFrontUrl: "storage://SECRET_FRONT", dniBackUrl: "SECRET_BACK",
  email: "SECRET_EMAIL", createdAt: "SECRET_CREATED", joinedAt: "SECRET_JOINED", futurePrivate: "SECRET_FUTURE" };

function harness(options = {}) {
  const state = { role: "STAFF", active: true, ...options };
  const reads = { auth: 0, members: [] };
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => state.anonymous ? null : { user: { id: "1", role: state.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/prisma": { prisma: {
      appUser: { findUnique: async () => { reads.auth++; return state.missing ? null : { id: 1, active: state.active, role: state.role }; } },
      // Deliberately return extra private fields even with select: DTO must independently whitelist.
      member: { findMany: async query => { reads.members.push(plain(query)); return state.empty ? [] : [state.member ?? row]; } },
    } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    let source = readFileSync(resolve(root, `${name.slice(2)}.ts`), "utf8").replace(/\r\n/g, "\n");
    if (name === "@/app/api/members/route") {
      for (const m of JSON.parse(process.env.MEMBERS_LIST_MUTATIONS ?? "[]")) {
        assert.ok(source.includes(m.from), "Mutation anchor missing");
        source = source.replaceAll(m.from, m.to);
      }
    }
    const exports = {}; cache.set(name, exports);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    class Clock extends Date {
      constructor(...args) { super(...(args.length ? args : ["2026-10-08T12:00:00.000Z"])); }
    }
    vm.runInNewContext(code, { exports, require: load, Response, Request, Date: Clock });
    return exports;
  }
  return { state, reads, get: () => load("@/app/api/members/route").GET() };
}

for (const role of ["STAFF", "ADMIN"]) test(`exact whitelist and select ${role}`, async () => {
  const h = harness({ role, jwtRole: "MEMBER" }); const res = await h.get(); const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(body, [{ ...Object.fromEntries(fields.map(k => [k, row[k]])), hasRfid: true, hasContract: true, expired: false }]);
  assert.deepEqual(h.reads.members, [{ select: {
    ...Object.fromEntries([...fields, "rfidCode"].map(k => [k, true])),
    contracts: { select: { id: true, consumptionGrams: true }, take: 1, orderBy: [{ signedAt: "desc" }, { id: "desc" }] },
  }, orderBy: { createdAt: "desc" } }]);
  assert.doesNotMatch(JSON.stringify(body), /SECRET|storage:|commercial|dniFrontUrl|dniBackUrl|createdAt|joinedAt|contracts|photoUrl/);
});
for (const [name, options, status] of [
  ["anonymous", { anonymous: true }, 401], ["inactive", { active: false }, 401],
  ["missing", { missing: true }, 401], ["forbidden", { role: "MEMBER" }, 403],
]) test(`auth ${name} and cache`, async () => {
  const h = harness(options); const res = await h.get();
  assert.equal(res.status, status); assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await res.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
  assert.equal(h.reads.members.length, 0);
});
test("persisted authority revocation next request despite ADMIN JWT", async () => {
  const h = harness(); assert.equal((await h.get()).status, 200);
  h.state.role = "MEMBER"; assert.equal((await h.get()).status, 403);
  h.state.role = "ADMIN"; assert.equal((await h.get()).status, 200);
  h.state.active = false; assert.equal((await h.get()).status, 401);
  assert.equal(h.reads.auth, 4); assert.equal(h.reads.members.length, 2);
});
test("empty list remains 200 and private", async () => {
  const res = await harness({ empty: true }).get();
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), []);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
});

test("hasRfid preserves assignment presence including empty and unassignment", async () => {
  const h = harness({ member: { ...row } });
  for (const [rfidCode, expected] of [[null, false], ["", false], ["000ABC", true], ["0", true], [null, false]]) {
    h.state.member.rfidCode = rfidCode;
    assert.equal((await (await h.get()).json())[0].hasRfid, expected);
  }
});

test("hasContract preserves historical presence, not signing sessions or operating permission", async () => {
  for (const status of ["PENDING", "SIGNED", "CANCELLED"]) {
    const h = harness({ member: { ...row, contracts: [], signingSessions: [{ status }] } });
    assert.equal((await (await h.get()).json())[0].hasContract, false);
  }
  const h = harness({ member: { ...row, active: false, expiresAt: new Date("2000-01-01T00:00:00Z"),
    contracts: [{ id: 1, consumptionGrams: null, signedAt: new Date("2000-01-01"), signingSessionId: null }] } });
  const [member] = await (await h.get()).json();
  assert.equal(member.hasContract, true);
  assert.equal(member.active, false);
  assert.equal(member.expired, true);
  assert.equal(Object.hasOwn(member, "canWithdraw"), false);
});

test("expired preserves null, strict instant boundary and timezone offsets", async () => {
  for (const [value, expected] of [[null, false], ["2026-10-08T12:00:00.001Z", false],
    ["2026-10-08T11:59:59.999Z", true], ["2026-10-08T12:00:00.000Z", false],
    ["2026-10-08T14:00:00.000+02:00", false], ["2026-10-08T07:00:00.000-05:00", false]]) {
    const expiresAt = value === null ? null : new Date(value);
    const [member] = await (await harness({ member: { ...row, expiresAt } }).get()).json();
    assert.equal(member.expired, expected, String(value));
    assert.equal(member.expiresAt, expiresAt?.toISOString() ?? null);
  }
});
