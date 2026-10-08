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
function readSource(name, filename) {
  let source = readFileSync(filename, "utf8");
  for (const mutation of JSON.parse(process.env.HISTORY_MUTATIONS ?? "[]")) {
    if (name !== mutation.file) continue;
    assert.ok(source.includes(mutation.from), "Mutation anchor missing");
    source = source.replaceAll(mutation.from, mutation.to);
  }
  return source;
}
const member = {
  id: 17, memberNumber: "17", fullName: "Socio", dni: "DOC", phone: "123", email: null,
  active: true, joinedAt: "2026-01-01", expiresAt: null, rfidCode: "USED_RFID",
  photoUrl: "storage://PRIVATE_PHOTO", dniFrontUrl: "PRIVATE_FRONT", dniBackUrl: "PRIVATE_BACK",
  commercialProfile: "SPECIAL", discountPercent: 10, commercialNotes: "ADMIN_ONLY",
  createdAt: "PRIVATE_CREATED", futurePrivate: "SECRET",
};
const common = ["id", "memberNumber", "fullName", "dni", "phone", "email", "active", "joinedAt", "expiresAt", "rfidCode"];
const commercial = ["commercialProfile", "discountPercent", "commercialNotes"];
const saleFields = ["id", "qty", "totalAmount", "finalAmount", "originalAmount", "discountAmount", "discountReason", "cancelledAt", "cancelReason", "createdAt"];
const pick = (value, fields) => Object.fromEntries(fields.map(k => [k, value[k]]));
const sale = { id: 3, qty: 2, totalAmount: 100, finalAmount: 80, originalAmount: 100,
  discountAmount: 20, discountReason: "Descuento", cancelledAt: null, cancelReason: null,
  createdAt: "2026-01-01", unitCost: 42, profit: 99, note: "INTERNAL", memberId: 17,
  product: { name: "Producto", unit: "G", averageCost: 42, stock: 999, sku: "INTERNAL" } };

function harness(options = {}) {
  const state = { role: "STAFF", active: true, ...options };
  const reads = { auth: 0, member: [], sales: [] };
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => state.anonymous ? null : { user: { id: "1", role: state.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/storage": { resolveStorageUrlForResponse: async () => "https://photo.invalid/existing" },
    "@/lib/member-dni": { memberDniUrls: async () => ({ dniFrontUrl: "/protected/front", dniBackUrl: null }) },
    "@/lib/prisma": { prisma: {
      appUser: { findUnique: async () => { reads.auth++; return state.missingUser ? null : { id: 1, role: state.role, active: state.active }; } },
      member: { findUnique: async query => { reads.member.push(plain(query)); if (state.prismaFailure) throw state.prismaFailure; return state.missing ? null : member; } },
      sale: { findMany: async query => { reads.sales.push(plain(query)); return state.sales ?? [sale]; } },
    } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, `${name.slice(2)}.ts`), exports = {};
    cache.set(name, exports);
    const source = readSource(name, filename);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: load, Response, Request }, { filename });
    return exports;
  }
  return { state, reads, get: (route = "history", id = "17") => load(`@/app/api/members/[id]/${route}/route`).GET(
    new Request("http://test/"), { params: Promise.resolve({ id }) }) };
}

for (const route of ["history", "identity", "registration"]) {
  for (const [name, options, status] of [
    ["anonymous", { anonymous: true }, 401], ["inactive", { active: false }, 401],
    ["missing user", { missingUser: true }, 401], ["forbidden", { role: "MEMBER" }, 403],
    ["STAFF", { jwtRole: "MEMBER" }, 200], ["ADMIN", { role: "ADMIN", jwtRole: "MEMBER" }, 200],
  ]) test(`${route} auth ${name} and cache`, async () => {
    const h = harness(options), res = await h.get(route);
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(h.reads.auth, options.anonymous ? 0 : 1);
    if (status !== 200) {
      assert.deepEqual(await res.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
      assert.equal(h.reads.member.length + h.reads.sales.length, 0);
    }
  });
  test(`${route} persisted revocation`, async () => {
    const h = harness(); assert.equal((await h.get(route)).status, 200);
    h.state.role = "MEMBER"; assert.equal((await h.get(route)).status, 403);
    h.state.active = false; assert.equal((await h.get(route)).status, 401);
    assert.equal(h.reads.member.length, 1);
  });
  test(`${route} uncontrolled infrastructure failure propagates without success DTO`, async () => {
    const error = new Error("database unavailable");
    await assert.rejects(harness({ prismaFailure: error }).get(route), error);
  });
  test(`${route} invalid IDs and missing member remain private`, async () => {
    const h = harness({ missing: true });
    for (const id of ["0", "017", "1e2", "-1", "2147483648", "abc"]) {
      const res = await h.get(route, id); assert.equal(res.status, 400);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(h.reads.member.length, 0);
    const res = await h.get(route, "18"); assert.equal(res.status, 404);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(h.reads.member[0].where.id, 18); assert.equal(h.reads.sales.length, 0);
  });
}
for (const role of ["STAFF", "ADMIN"]) test(`history exact whitelist ${role} and query`, async () => {
  const h = harness({ role }), body = await (await h.get()).json();
  assert.deepEqual(body, {
    member: { ...pick(member, common), photoUrl: "https://photo.invalid/existing", hasDniFront: true, hasDniBack: false,
      ...(role === "ADMIN" ? pick(member, commercial) : {}) },
    sales: [{ ...pick(sale, saleFields), product: { name: "Producto", unit: "G" } }],
    totalSpent: 80, count: 1,
  });
  assert.deepEqual(h.reads.member, [{ where: { id: 17 }, select: {
    ...Object.fromEntries([...common, "photoUrl", "dniFrontUrl", "dniBackUrl"].map(k => [k, true])),
    ...Object.fromEntries(commercial.map(k => [k, role === "ADMIN"])),
  } }]);
  assert.deepEqual(h.reads.sales, [{ where: { memberId: 17 }, orderBy: { createdAt: "desc" }, select: {
    ...Object.fromEntries(saleFields.map(k => [k, true])), product: { select: { name: true, unit: true } },
  } }]);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_|storage:\/\/|SECRET|unitCost|averageCost|dniFrontUrl|dniBackUrl/);
});
test("aggregates preserve cancellation, legacy fallback and zero final amount", async () => {
  const sales = [sale, { ...sale, id: 4, finalAmount: null, totalAmount: 12 },
    { ...sale, id: 5, finalAmount: 0 }, { ...sale, id: 6, cancelledAt: "2026-01-02", finalAmount: 999 }];
  const body = await (await harness({ sales }).get()).json();
  assert.equal(body.totalSpent, 92); assert.equal(body.count, 3); assert.equal(body.sales.length, 4);
  assert.equal(body.sales[3].cancelledAt, "2026-01-02");
  const empty = await (await harness({ sales: [] }).get()).json();
  assert.equal(empty.totalSpent, 0); assert.equal(empty.count, 0);
});
for (const [route, fields] of [["identity", ["fullName", "dni", "phone", "email"]],
  ["registration", ["id", "memberNumber", "fullName", "dni", "phone", "email", "active", "expiresAt", "rfidCode"]]]) {
  test(`${route} exact whitelist without sales`, async () => {
    const h = harness(); assert.deepEqual(await (await h.get(route)).json(), { member: pick(member, fields) });
    assert.deepEqual(h.reads.member, [{ where: { id: 17 }, select: Object.fromEntries(fields.map(k => [k, true])) }]);
    assert.equal(h.reads.sales.length, 0);
  });
}
test("consumers separate identity and registration; canonical row amounts", () => {
  const read = path => readSource(`@/${path.replace(/\.tsx?$/, "")}`, resolve(root, path));
  for (const [path, route] of [["app/members/[id]/contract/page.tsx", "identity"], ["app/members/new/page.tsx", "registration"]]) {
    const source = read(path); assert.ok(source.includes(`/${route}`)); assert.doesNotMatch(source, /\/history/);
  }
  const page = read("app/members/[id]/page.tsx");
  assert.equal((page.match(/Number\(sale.finalAmount \?\? sale.totalAmount\)/g) ?? []).length, 2);
  assert.doesNotMatch(page, /data\.member\.dni(?:Front|Back)Url/);
});
