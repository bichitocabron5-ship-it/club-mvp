// Real routes, persisted auth, audit helper and normalizers; simulated Prisma.
// Transaction rollback here is a model, not a PostgreSQL concurrency test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, posix } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client");
const root = resolve(import.meta.dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const instant = "2027-09-16T16:00:00.000Z";
const now = new Date("2026-10-08T12:34:56.789Z");
const unique = () => new Prisma.PrismaClientKnownRequestError("private", {
  code: "P2002", clientVersion: "7.8.0", meta: { target: ["rfidCode"] },
});

function harness(options = {}) {
  const state = { role: "STAFF", active: true, ...options };
  let member = {
    id: 17, memberNumber: "17", fullName: "Socio", dni: "AB1234", phone: "123",
    email: "member@example.test", active: false, expiresAt: new Date(instant), rfidCode: null,
    commercialProfile: "STANDARD", discountPercent: 0, commercialNotes: "PRIVATE_NOTES",
    dniFrontUrl: "storage://PRIVATE_FRONT", dniBackUrl: "storage://PRIVATE_BACK",
    photoUrl: "storage://PRIVATE_PHOTO", relations: [{ secret: true }],
    createdAt: now, futureSensitiveField: "PRIVATE_FUTURE", ...options.member,
  };
  const audits = [], writes = [], calls = { auth: 0, member: 0, transactions: 0 };
  const delegate = {
    async findUnique() { calls.member++; return state.missing ? null : { ...member }; },
    async findMany() { return []; },
    async create({ data }) { member = { ...member, ...data }; return { ...member }; },
    async update({ data }) {
      writes.push(plain(data));
      member = { ...member, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
      return { ...member };
    },
    async updateMany({ where, data }) {
      if (state.race) { member.rfidCode = "CONCURRENT"; state.race = false; }
      if (where.id !== member.id || (Object.hasOwn(where, "rfidCode") && where.rfidCode !== member.rfidCode)) return { count: 0 };
      if (data.rfidCode === "DUPLICATE") throw unique();
      await delegate.update({ data }); return { count: 1 };
    },
  };
  const auditLog = { async create({ data }) {
    if (state.auditFailure) throw new Error("audit unavailable");
    audits.push(plain(data)); return data;
  } };
  const prisma = {
    appUser: { async findUnique() {
      calls.auth++;
      return state.missingUser ? null : { id: 1, active: state.active, role: state.role, name: "Actor", email: " ACTOR@EXAMPLE.TEST " };
    } },
    member: delegate, auditLog,
    async $transaction(fn) {
      calls.transactions++;
      const before = { ...member }, length = audits.length;
      try { return await fn({ member: delegate, auditLog }); }
      catch (error) { member = before; audits.length = length; throw error; }
    },
  };
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => state.anonymous ? null : { user: { id: "1", role: state.jwtRole ?? "ADMIN", email: "jwt@example.test" } } },
    "@/lib/auth": { authConfig: {} }, "@/lib/prisma": { prisma },
    "@/lib/storage": {
      isStorageUrlsDisabled: () => false, buildMemberPhotoPath: () => "photo-key",
      validateImageFile: () => null, getImageExtension: () => "png", parseStorageUrl: () => null,
      uploadImageToStorage: async () => ({ bucket: "private", path: "photo-key", storageRef: "storage://private/photo-key" }),
      createStorageSignedUrl: async () => "https://photo.test/signed",
    },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => { throw new Error("Unexpected cleanup"); } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const file = name.slice(2) + ".ts", filename = resolve(root, file);
    let source = readFileSync(filename, "utf8");
    for (const mutation of JSON.parse(process.env.MEMBER_MUTATION_MUTATIONS ?? "[]")) {
      if (mutation.file !== file) continue;
      assert.ok(source.includes(mutation.from), `Mutation anchor missing: ${mutation.from}`);
      source = source.replaceAll(mutation.from, mutation.to);
    }
    const exports = {}; cache.set(name, exports);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
    vm.runInNewContext(code, { exports, require: dependency => load(dependency.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(name), dependency)) : dependency),
    Response, Request, File, FormData, Date: Clock, SyntaxError, console }, { filename });
    return exports;
  }
  return {
    state, audits, writes, calls, get member() { return member; },
    async send(body, route = "edit", id = "17") {
      const suffix = { edit: "/[id]", rfid: "/[id]/rfid", status: "/[id]/status", create: "", photo: "/[id]/photo" }[route];
      const method = ["create", "photo"].includes(route) ? "POST" : "PATCH";
      const form = new FormData(); form.set("image", new File(["image"], "photo.png", { type: "image/png" }));
      return load(`@/app/api/members${suffix}/route`)[method](
        new Request("http://test/member", { method, body: route === "photo" ? form : typeof body === "string" ? body : JSON.stringify(body) }),
        { params: Promise.resolve({ id }) });
    },
  };
}
async function response(res, status, expected) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const data = await res.json();
  if (expected) assert.deepEqual(data, expected);
  return data;
}
const requests = {
  edit: { fullName: "Changed", phone: "456", email: "new@example.test" },
  rfid: { rfidCode: "TAG", expectedRfidCode: null },
  status: { active: true }, create: { fullName: "Created", dni: "NEW123" }, photo: {},
};
for (const route of Object.keys(requests)) {
  for (const [label, options, status] of [
    ["anonymous", { anonymous: true }, 401], ["inactive", { active: false }, 401],
    ["missing user", { missingUser: true }, 401], ["persisted MEMBER", { role: "MEMBER" }, 403],
    ["STAFF", { role: "STAFF", jwtRole: "MEMBER" }, route === "status" ? 403 : 200],
    ["ADMIN", { role: "ADMIN", jwtRole: "MEMBER" }, 200],
  ]) test(`auth ${route} ${label}`, async () => {
    const h = harness(options); await response(await h.send(requests[route], route), status);
    assert.equal(h.calls.auth, options.anonymous ? 0 : route === "rfid" && status === 200 ? 2 : 1);
    if (status !== 200) { assert.equal(h.calls.member, 0); assert.equal(h.writes.length, 0); assert.equal(h.audits.length, 0); }
  });
  test(`revocation ${route}`, async () => {
    const h = harness({ role: "ADMIN" });
    await response(await h.send(requests[route], route), 200);
    h.state.role = "STAFF";
    await response(await h.send(route === "rfid" ? { rfidCode: "TAG", expectedRfidCode: "TAG" } : requests[route], route), route === "status" ? 403 : 200);
    h.state.role = "MEMBER"; await response(await h.send(requests[route], route), 403);
    h.state.role = "ADMIN"; h.state.active = false;
    await response(await h.send(requests[route], route), 401);
  });
}
for (const role of ["STAFF", "ADMIN"]) {
  test(`exact edit DTO ${role} and personal audit`, async () => {
    const h = harness({ role });
    await response(await h.send(requests.edit), 200, { ok: true });
    assert.equal(h.member.fullName, "Changed"); assert.equal(h.member.phone, "456");
    assert.equal(h.member.email, "new@example.test"); assert.equal(h.member.expiresAt.toISOString(), instant);
    assert.ok(!Object.hasOwn(h.writes[0], "expiresAt"));
    assert.deepEqual(h.audits[0], { actorUserId: 1, actorEmail: "actor@example.test", action: "MEMBER_UPDATED",
      entityType: "Member", entityId: "17", summary: "Socio actualizado #17", metadata: { changedFields: ["fullName", "phone", "email"] } });
  });
  test(`exact create DTO ${role}`, async () => {
    const h = harness({ role });
    const data = await response(await h.send(requests.create, "create"), 200);
    assert.deepEqual(Object.keys(data).sort(), ["id", "memberNumber", "fullName", "dni", "phone", "email", "expiresAt", "rfidCode"].sort());
    assert.equal(data.fullName, "Created"); assert.equal(data.dni, "NEW123");
    assert.ok(!JSON.stringify(data).includes("PRIVATE"));
    assert.equal(h.audits[0].action, "MEMBER_CREATED");
  });
  for (const value of [null, "", "2029-01-02"]) test(`expiry policy ${role} ${value}`, async () => {
    const h = harness({ role }); await response(await h.send({ expiresAt: value }), 200, { ok: true });
    assert.equal(h.member.expiresAt?.toISOString() ?? null, value ? "2029-01-02T00:00:00.000Z" : null);
  });
}
test("commercial policy and exact DTO", async () => {
  const h = harness();
  for (const body of [{ commercialProfile: "VIP" }, { discountPercent: 10 }, { commercialNotes: "Changed" }, { active: true }]) {
    await response(await h.send(body), 403); assert.equal(h.writes.length, 0);
  }
  // Existing equal-value submissions are accepted, without exposing notes.
  await response(await h.send({ commercialNotes: "PRIVATE_NOTES" }), 200, { ok: true });
  h.state.role = "ADMIN";
  await response(await h.send({ commercialProfile: "VIP", discountPercent: 10, commercialNotes: "Changed" }), 200, { ok: true });
  assert.equal(h.member.commercialNotes, "Changed"); assert.equal(h.member.expiresAt.toISOString(), instant);
  assert.deepEqual(h.audits.at(-1), { actorUserId: 1, actorEmail: "actor@example.test", action: "MEMBER_COMMERCIAL_UPDATED",
    entityType: "Member", entityId: "17", summary: "Perfil comercial actualizado para socio #17",
    metadata: { commercialProfile: "[REDACTED]", discountPercent: 10, notesUpdated: true } });
});
for (const route of ["edit", "rfid"]) {
  test(`exact RFID DTO transitions noops audit ${route}`, async () => {
    const h = harness();
    for (const [expectedRfidCode, rfidCode, operation] of [[null, "TAG", "ASSIGN"], ["TAG", "NEXT", "CHANGE"], ["NEXT", null, "UNASSIGN"]]) {
      await response(await h.send({ rfidCode, expectedRfidCode }, route), 200, { rfidCode });
      assert.equal(h.member.rfidCode, rfidCode);
      assert.deepEqual(h.audits.at(-1), { actorUserId: 1, actorEmail: "actor@example.test", action: "MEMBER_RFID_UPDATED",
        entityType: "Member", entityId: "17", summary: "RFID actualizado para socio #17",
        metadata: { operation, hadRfid: expectedRfidCode !== null, hasRfid: rfidCode !== null } });
    }
    await response(await h.send({ rfidCode: null, expectedRfidCode: null }, route), 200, { rfidCode: null });
    await response(await h.send({ rfidCode: null, expectedRfidCode: "OLD" }, route), 200, { rfidCode: null });
    assert.equal(h.audits.length, 3); assert.equal(h.writes.length, 3);
    assert.equal(h.member.expiresAt.toISOString(), instant);
    const assigned = harness({ member: { rfidCode: "TAG" } });
    await response(await assigned.send({ rfidCode: "TAG", expectedRfidCode: "TAG" }, route), 200, { rfidCode: "TAG" });
    assert.equal(assigned.audits.length, 0); assert.equal(assigned.writes.length, 0);
  });
  test(`RFID preconditions conflicts rollback ${route}`, async () => {
    const h = harness();
    for (const body of [{ rfidCode: "TAG" }, { expectedRfidCode: null }, { rfidCode: "TAG", expectedRfidCode: null, phone: "x" }]) {
      await response(await h.send(body, route), 400);
    }
    assert.equal(h.writes.length, 0);
    const stale = await response(await h.send({ rfidCode: "TAG", expectedRfidCode: "STALE" }, route), 409);
    assert.equal(stale.code, "RFID_EXPECTATION_FAILED"); assert.equal(h.member.rfidCode, null);
    const duplicate = await response(await h.send({ rfidCode: "DUPLICATE", expectedRfidCode: null }, route), 409);
    assert.equal(duplicate.code, "RFID_ALREADY_ASSIGNED"); assert.equal(h.audits.length, 0);
    h.state.auditFailure = true;
    await response(await h.send(requests.rfid, route), 500);
    assert.equal(h.member.rfidCode, null); assert.equal(h.audits.length, 0);
    const racing = harness({ race: true });
    await response(await racing.send(requests.rfid, route), 409);
    assert.equal(racing.member.rfidCode, "CONCURRENT"); assert.equal(racing.audits.length, 0);
  });
}
for (const [label, payload] of [["block", { active: false }], ["activate", { active: true }],
  ["renew", { renewOneYear: true }], ["clear", { clearExpiration: true }]]) {
  test(`exact status DTO ${label} semantics audit`, async () => {
    const h = harness({ role: "ADMIN", member: { active: label === "block" } });
    await response(await h.send(payload, "status"), 200, { ok: true });
    assert.equal(h.member.active, label === "activate" || label === "renew");
    assert.equal(h.member.expiresAt?.toISOString() ?? null, label === "clear" ? null : label === "renew" ? "2027-10-08T12:34:56.789Z" : instant);
    assert.deepEqual(h.audits[0], { actorUserId: 1, actorEmail: "actor@example.test", action: "MEMBER_STATUS_UPDATED",
      entityType: "Member", entityId: "17", summary: "Estado actualizado para socio #17",
      metadata: { active: h.member.active, hasExpiration: label !== "clear" } });
  });
}
test("status combined flags retain precedence and no-op audit", async () => {
  const h = harness({ role: "ADMIN" });
  await response(await h.send({ active: false }, "status"), 200, { ok: true }); assert.equal(h.audits.length, 0);
  await response(await h.send({ active: false, renewOneYear: true, clearExpiration: true }, "status"), 200, { ok: true });
  assert.equal(h.member.active, true); assert.equal(h.member.expiresAt, null);
});
test("controlled errors cache", async () => {
  for (const route of ["edit", "rfid", "status", "photo"]) {
    const h = harness({ role: "ADMIN", missing: true });
    await response(await h.send(requests[route], route), 404);
    await response(await h.send(requests[route], route, "invalid"), 400);
  }
  for (const route of ["edit", "rfid", "create"]) await response(await harness().send("{", route), 400);
  await response(await harness().send({ expiresAt: "bad" }), 400);
});
test("photo retains only required signed URL and audit", async () => {
  const h = harness();
  await response(await h.send({}, "photo"), 200, { photoUrl: "https://photo.test/signed" });
  assert.equal(h.member.photoUrl, "storage://private/photo-key");
  assert.equal(h.member.expiresAt.toISOString(), instant);
  assert.equal(h.audits[0].action, "MEMBER_PHOTO_UPLOADED");
});
