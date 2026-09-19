// Real page callbacks, PATCH routes, Zod and normalizers; simulated hooks, HTTP,
// auth and Prisma storage. No browser, database, SQL or concurrency guarantees.
// Run: node scripts/test-member-expiration-preservation.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const iso = value => value?.toISOString() ?? null;
const original = "2027-09-16T16:00:00.000Z";
function loader(mocks, globals = {}) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const base = resolve(root, name.slice(2));
    const filename = base + (existsSync(base + ".ts") ? ".ts" : ".tsx");
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(code, { exports, require: load, console, Response, Request, ...globals }, { filename });
    return exports;
  }
  return load;
}
function apiHarness(expiration = original, role = "ADMIN") {
  let member = {
    id: 1, memberNumber: "1", fullName: "Test Member", dni: "AB1234", phone: "123",
    email: "test@example.com", expiresAt: expiration === null ? null : new Date(expiration),
    active: true, rfidCode: null, commercialProfile: "STANDARD", discountPercent: 0, commercialNotes: null,
  };
  const writes = [], audits = [];
  const prisma = {
    member: {
      async findUnique() { return { ...member }; },
      async update({ data }) {
        writes.push(data);
        member = { ...member, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
        return { ...member };
      },
      async updateMany({ where, data }) {
        if (where.id !== member.id || where.rfidCode !== member.rfidCode) return { count: 0 };
        await prisma.member.update({ data });
        return { count: 1 };
      },
    },
    auditLog: { async create({ data }) { audits.push(data); } },
    async $transaction(fn) { return fn(prisma); },
  };
  const auth = async () => ({ ok: true, session: { user: { id: "1", email: "staff@example.com", role } } });
  const load = loader({
    "@/lib/prisma": { prisma }, "@/lib/auth-server": { requireStaffOrAdmin: auth, requireAdmin: auth },
    "@/lib/audit": { createAuditLog: async data => audits.push(data) }, "next/server": { NextResponse: Response },
  });
  const patch = load("@/app/api/members/[id]/route").PATCH;
  const status = load("@/app/api/members/[id]/status/route").PATCH;
  return {
    writes, audits, get member() { return member; },
    async send(body, isStatus = false) {
      return (isStatus ? status : patch)(new Request("http://test/api/members/1", {
        method: "PATCH", body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: "1" }) });
    },
  };
}
async function pageHarness(api, role = "ADMIN") {
  const slots = [], effects = [], payloads = [];
  let cursor = 0, tree;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, j) => value !== slots[i][j])) { slots[i] = deps; effects.push(fn); }
    },
  };
  const load = loader({
    react, "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role } } }) },
    "next/navigation": { useParams: () => ({ id: "1" }) },
    "next/image": { default: () => null },
    "@/components/member-documents-card": { MemberDocumentsCard: () => null },
    "@/components/member-photo-card": { MemberPhotoCard: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, {
    window: { location: { reload() {} }, confirm: () => true },
    alert: message => { throw new Error(message); }, setTimeout: () => 0, clearTimeout() {},
    fetch: async (url, options) => {
      if (options?.method === "PATCH") {
        const payload = JSON.parse(options.body);
        payloads.push(payload);
        return api.send(payload, url.endsWith("/status"));
      }
      return Response.json(url.endsWith("/history")
        ? { member: api.member, sales: [], totalSpent: 0, count: 0 } : []);
    },
  });
  const Page = load("@/app/members/[id]/page").default;
  const child = Page();
  function render() { cursor = 0; tree = child.type(child.props); }
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...nodes(node.props?.children)];
  }
  const text = node => typeof node === "string" ? node : Array.isArray(node)
    ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
  async function click(label) {
    const button = nodes(tree).find(node => node.type === "button" && text(node).trim() === label);
    assert.ok(button, `Button ${label}`);
    await button.props.onClick(); render();
  }
  render();
  for (const effect of effects.splice(0)) effect();
  await new Promise(resolve => setImmediate(resolve));
  render();
  return {
    payloads, click,
    change(field, value) {
      const node = nodes(tree).find(node => ["input", "textarea", "select"].includes(node.type) &&
        (field === "expiresAt" ? node.props.type === "date" : node.props.value === field));
      assert.ok(node, `Control ${field}`);
      node.props.onChange({ target: { value } }); render();
    },
  };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
function preserved(api, expected) {
  assert.equal(iso(api.member.expiresAt), expected);
  assert.ok(api.writes.length > 0);
  for (const write of api.writes) assert.equal(Object.hasOwn(write, "expiresAt"), false);
}
for (const role of ["ADMIN", "STAFF"]) {
  for (const [name, changes] of [
    ["A phone", [["123", "456"]]], ["B name", [["Test Member", "Changed Member"]]],
    ["C DNI", [["AB1234", "CD5678"]]],
    ["D multiple", [["123", "456"], ["Test Member", "Changed Member"], ["test@example.com", "new@example.com"], ["1", "2"]]],
    ["E untouched", []],
  ]) await test(`${name} (${role}): UI -> PATCH preserves exact instant`, async () => {
    const api = apiHarness(original, role), page = await pageHarness(api, role);
    await page.click("Editar socio");
    for (const [field, value] of changes) page.change(field, value);
    await page.click("Guardar cambios");
    assert.equal(Object.hasOwn(page.payloads[0], "expiresAt"), false);
    preserved(api, original);
  });
}
await test("Commercial fields do not edit expiration", async () => {
  const api = apiHarness(), page = await pageHarness(api);
  await page.click("Editar socio"); page.change("STANDARD", "VIP"); page.change("0", "10");
  await page.click("Guardar cambios"); preserved(api, original);
});
for (const value of ["2028-10-20", "2027-09-16", ""]) {
  await test(`F explicit date control '${value}'`, async () => {
    const api = apiHarness(), page = await pageHarness(api);
    await page.click("Editar socio"); page.change("expiresAt", value);
    await page.click("Guardar cambios");
    assert.equal(page.payloads[0].expiresAt, value);
    assert.equal(iso(api.member.expiresAt), value === "" ? null : `${value}T00:00:00.000Z`);
  });
}
for (const close of ["Cancelar", "Editando socio"]) await test(`Cancel/reopen resets expiration intent: ${close}`, async () => {
  const api = apiHarness(), page = await pageHarness(api);
  await page.click("Editar socio"); page.change("expiresAt", "2030-01-01");
  await page.click(close); await page.click("Editar socio"); page.change("123", "456");
  await page.click("Guardar cambios"); preserved(api, original);
});
await test("G renewal via UI/status then unrelated save preserves renewed instant", async () => {
  const api = apiHarness(), page = await pageHarness(api);
  const before = new Date(); before.setFullYear(before.getFullYear() + 1);
  await page.click("Renovar 1 año");
  const after = new Date(); after.setFullYear(after.getFullYear() + 1);
  assert.ok(api.member.expiresAt >= before && api.member.expiresAt <= after);
  assert.equal(api.member.active, true);
  const renewed = iso(api.member.expiresAt); api.writes.length = 0;
  await page.click("Editar socio"); page.change("123", "456"); await page.click("Guardar cambios");
  preserved(api, renewed);
});
await test("H clearExpiration via UI/status then unrelated save stays null", async () => {
  const api = apiHarness(), page = await pageHarness(api);
  await page.click("Quitar vencimiento"); assert.equal(api.member.expiresAt, null);
  api.writes.length = 0;
  await page.click("Editar socio"); page.change("123", "456"); await page.click("Guardar cambios");
  preserved(api, null);
});
await test("Status block/activate preserve expiration", async () => {
  const api = apiHarness(), page = await pageHarness(api);
  await page.click("Bloquear socio"); assert.equal(api.member.active, false);
  await page.click("Activar socio"); assert.equal(api.member.active, true); preserved(api, original);
});
for (const [name, value] of [["I null", null], ["J past", "2020-02-03T12:34:56.789Z"], ["K future", "2090-02-03T12:34:56.789Z"]]) {
  await test(name, async () => {
    const api = apiHarness(value), page = await pageHarness(api);
    await page.click("Editar socio"); page.change("123", "456"); await page.click("Guardar cambios"); preserved(api, value);
  });
}
await test("L direct omitted field has no Prisma key", async () => {
  const api = apiHarness(); assert.equal((await api.send({ phone: "456" })).status, 200); preserved(api, original);
});
for (const role of ["ADMIN", "STAFF"]) {
  for (const [value, expected] of [["2028-01-02", "2028-01-02T00:00:00.000Z"], [original, "2027-09-16T00:00:00.000Z"], [null, null], ["", null]]) {
    await test(`M explicit ${JSON.stringify(value)} (${role})`, async () => {
      const api = apiHarness(original, role);
      assert.equal((await api.send({ expiresAt: value })).status, 200);
      assert.equal(iso(api.member.expiresAt), expected); assert.ok(Object.hasOwn(api.writes[0], "expiresAt"));
    });
  }
}
for (const value of ["not-a-date", "2027-99-99", 123, false, {}, []]) await test(`N invalid ${JSON.stringify(value)}: no partial write`, async () => {
  const api = apiHarness();
  assert.equal((await api.send({ phone: "456", expiresAt: value })).status, 400);
  assert.equal(api.writes.length, 0); assert.equal(api.audits.length, 0);
  assert.equal(api.member.phone, "123"); assert.equal(iso(api.member.expiresAt), original);
});
await test("O RFID ASSIGN/CHANGE/UNASSIGN, stale expectation and mixed payload", async () => {
  const api = apiHarness();
  for (const [expectedRfidCode, rfidCode, operation] of [[null, "TAG1", "ASSIGN"], ["TAG1", "TAG2", "CHANGE"], ["TAG2", null, "UNASSIGN"]]) {
    assert.equal((await api.send({ rfidCode, expectedRfidCode })).status, 200);
    assert.equal(api.member.rfidCode, rfidCode); assert.equal(api.audits.at(-1).metadata.operation, operation);
  }
  assert.equal((await api.send({ rfidCode: "TAG3", expectedRfidCode: "STALE" })).status, 409);
  assert.equal((await api.send({ rfidCode: "TAG3", expectedRfidCode: null, expiresAt: null })).status, 400);
  assert.equal(api.writes.length, 3); preserved(api, original);
});
console.log(`${checks} checks passed. Simulated storage/hooks; no real database, browser or concurrency verification.`);
