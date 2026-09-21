// Production GET, core and page callbacks/JSX; simulated hooks, HTTP, auth and Prisma.
// No real browser/database. Run: node scripts/test-member-operational-ui.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");
function loader(mocks = {}, globals = {}) {
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
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const now = new Date("2026-09-21T12:00:00.000Z");
const future = new Date(now.getTime() + 1), past = new Date(now.getTime() - 1);
const contract = { id: 42, consumptionGrams: 25, signedAt: now };
const cases = [
  ["A", true, null, contract, null, false],
  ["B", true, future, contract, "TAG", false],
  ["C", true, past, contract, "TAG", true],
  ["D", false, future, contract, "TAG", false],
  ["E", true, future, null, "TAG", false],
  ["F", false, past, null, null, true],
  ["G", true, future, { ...contract, consumptionGrams: null }, "TAG", false],
  ["H", true, future, contract, null, false],
  ["I", true, future, contract, "TAG", false],
  ["J", true, future, null, null, false],
  ["K", true, future, contract, null, false],
  ["L", true, now, contract, null, false],
];
const rows = cases.map(([name, active, expiresAt, selected, rfidCode], i) => ({
  id: i + 1, memberNumber: String(i + 1), fullName: `Member ${name}`, dni: `DOC${i}`,
  phone: "123", email: "member@example.com", photoUrl: "private-photo", dniFrontUrl: "private-front",
  dniBackUrl: "private-back", active, expiresAt, rfidCode, createdAt: now, joinedAt: now,
  commercialProfile: "STANDARD", discountPercent: 0, commercialNotes: null,
  contracts: selected ? [selected] : [],
}));
const core = loader()("@/lib/member-operational-status").getMemberOperationalFacts;
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }

async function listApi(override) {
  const calls = [], queries = [];
  let clockReads = 0;
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime() + clockReads++])); }
  }
  const load = loader({
    "@/lib/auth-server": { requireAuth: async () => ({ ok: true }) },
    "@/lib/prisma": { prisma: { member: { findMany: async query => { queries.push(query); return rows; } } } },
    "next/server": { NextResponse: Response },
    "@/lib/member-operational-status": { getMemberOperationalFacts: (...args) => {
      calls.push(args);
      return override ? override(...args) : core(...args);
    } },
  }, { Date: ServerDate, fetch() { throw new Error("Unexpected extra request"); } });
  const response = await load("@/app/api/members/route").GET();
  assert.equal(response.status, 200);
  return { result: await response.json(), calls, queries, clockReads };
}
const api = await listApi();
await test("GET uses core for A-L, existing query, one shared now and no N+1", () => {
  assert.equal(api.queries.length, 1);
  assert.deepEqual(plain(api.queries[0]), {
    include: { contracts: { take: 1, orderBy: { signedAt: "desc" } } }, orderBy: { createdAt: "desc" },
  });
  assert.equal(api.clockReads, 1);
  assert.equal(api.calls.length, rows.length);
  api.calls.forEach(([member, selected, time], i) => {
    assert.equal(member, rows[i]);
    assert.equal(selected, rows[i].contracts[0] ?? null);
    assert.equal(time, api.calls[0][2]);
    assert.equal(time.getTime(), now.getTime());
  });
});
for (const [i, [name, , , selected, , expired]] of cases.entries()) {
  await test(`${name}: DTO agrees with real core and preserves previous fields`, () => {
    const row = rows[i], result = api.result[i];
    const facts = core(row, selected, now);
    assert.equal(result.expired, expired);
    assert.equal(result.expired, facts.expired);
    assert.equal(result.hasContract, facts.hasContract);
    const { contracts, ...previous } = row;
    assert.deepEqual(result, plain({ ...previous, photoUrl: null, hasPhoto: true,
      dniFrontUrl: null, dniBackUrl: null, hasContract: facts.hasContract, expired: facts.expired }));
    assert.equal(Object.hasOwn(result, "contracts"), false);
    assert.equal(contracts.length, selected ? 1 : 0);
  });
}
await test("GET maps facts.hasContract and facts.expired, without recomputing them", async () => {
  const sentinel = await listApi(() => ({ hasContract: "contract-from-core", expired: "expiry-from-core" }));
  for (const row of sentinel.result) {
    assert.equal(row.hasContract, "contract-from-core");
    assert.equal(row.expired, "expiry-from-core");
  }
});

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const text = node => typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
function pageHarness(path, fetch, clientTime = "2099-01-01T00:00:00Z") {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0, tree, renderPage, reloads = 0;
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
  class ClientDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clientTime])); }
    static now() { return new Date(clientTime).getTime(); }
  }
  const load = loader({
    react, "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role: "ADMIN" } } }) },
    "next/navigation": { useParams: () => ({ id: "1" }) },
    "next/image": { default: () => null }, "next/link": { default: () => null },
    "@/components/member-documents-card": { MemberDocumentsCard: () => null },
    "@/components/member-photo-card": { MemberPhotoCard: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, {
    fetch, Date: ClientDate, window: { location: { reload() { reloads++; } }, confirm: () => true },
    alert(message) { throw new Error(message); }, setTimeout: () => 0, clearTimeout() {},
  });
  const Page = load(path).default;
  if (path.includes("[id]")) { const child = Page(); renderPage = () => child.type(child.props); }
  else renderPage = Page;
  function render() { cursor = 0; tree = renderPage(); }
  render();
  for (const effect of effects.splice(0)) cleanups.push(effect());
  return {
    render, get tree() { return tree; }, get reloads() { return reloads; },
    get nodes() { return nodes(tree); }, get text() { return text(tree); },
    async flush() { await tick(); render(); },
    button(label) {
      const node = nodes(tree).find(n => n.type === "button" && text(n).trim() === label);
      assert.ok(node, `Button ${label}`); return node;
    },
    async click(label) { await this.button(label).props.onClick(); await this.flush(); },
    change(predicate, value) {
      const node = nodes(tree).find(predicate); assert.ok(node, "Input exists");
      node.props.onChange({ target: { value } }); render();
    },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}
const badge = (tree, label) => nodes(tree).find(n => n.type === "span" && text(n).trim() === label);
for (const clientTime of ["1900-01-01T00:00:00Z", "2099-01-01T00:00:00Z"]) {
  await test(`List filters/badges use server facts with divergent client clock ${clientTime}`, async () => {
    const requests = [];
    const page = pageHarness("@/app/members/page", async url => {
      requests.push(url); assert.equal(url, "/api/members"); return Response.json(api.result);
    }, clientTime);
    await page.flush();
    const ids = () => page.nodes.filter(n => /^\/members\/\d+$/.test(n.props?.href)).map(n => Number(n.props.href.split("/").at(-1)));
    assert.deepEqual(ids(), rows.map(r => r.id));
    for (const row of api.result) {
      const card = page.nodes.find(n => n.props?.href === `/members/${row.id}`);
      assert.ok(badge(card, row.active ? "ACTIVO" : "BLOQUEADO"));
      assert.ok(badge(card, row.hasContract ? "CONTRATO" : "SIN CONTRATO"));
      assert.equal(Boolean(badge(card, "RFID")), Boolean(row.rfidCode));
      assert.equal(Boolean(badge(card, "CADUCADO")), row.expired);
      assert.equal(Boolean(badge(card, "VÁLIDO")), !row.expired && Boolean(row.expiresAt));
      if (row.expired) assert.match(badge(card, "CADUCADO").props.className, /danger/);
      if (row.expiresAt) {
        const date = nodes(card).find(n => n.type === "span" && text(n) === new Date(row.expiresAt).toLocaleDateString("es-ES"));
        assert.ok(date);
        assert.equal(date.props.className.includes("text-red-700"), row.expired);
      }
    }
    for (const [filter, expected] of [
      ["ACTIVE", [1, 2, 5, 7, 8, 9, 10, 11, 12]], ["EXPIRED", [3, 6]],
      ["BLOCKED", [4, 6]], ["NO_CONTRACT", [5, 6, 10]], ["ALL", rows.map(r => r.id)],
    ]) {
      await page.click({ ACTIVE: "Activos", EXPIRED: "Caducados", BLOCKED: "Bloqueados", NO_CONTRACT: "Sin contrato", ALL: "Todos" }[filter]);
      assert.deepEqual(ids(), expected, filter);
    }
    assert.deepEqual(requests, ["/api/members"]);
  });
}

const snapshot = (overrides = {}) => ({
  member: { active: false, expiresAt: "2020-01-02T12:00:00.000Z", rfidCode: "UNTRUSTED-OPERATIONAL-RFID", fullName: "Wrong name" },
  expired: true, hasContract: false, canWithdraw: true, ...overrides,
});
function detailHarness(initial = snapshot()) {
  const requests = [], pending = [], payloads = [];
  let member = plain({ ...rows[0], photoUrl: null, active: true, expiresAt: future, rfidCode: "CONFIRMED" });
  let current = initial, hold = false, failure = false, rfidConflict = false;
  const page = pageHarness("@/app/members/[id]/page", async (url, options) => {
    requests.push(url);
    if (url.endsWith("/operational-status")) {
      if (hold) return new Promise(resolve => pending.push(resolve));
      return failure ? Response.json({ error: "failed" }, { status: 503 }) : Response.json(current);
    }
    if (options?.method === "PATCH") {
      const payload = JSON.parse(options.body); payloads.push(payload);
      if (rfidConflict && Object.hasOwn(payload, "rfidCode")) {
        rfidConflict = false;
        member = { ...member, rfidCode: "OTHER-CONFIRMED" };
        return Response.json({ error: "Conflict" }, { status: 409 });
      }
      member = { ...member, ...payload };
      return Response.json(member);
    }
    if (url.endsWith("/history")) return Response.json({ member, sales: [], totalSpent: 0, count: 0 });
    if (url.endsWith("/contracts")) return Response.json([{ ...contract, signedAt: now.toISOString(), signedPdfUrl: "/pdf", signatureImage: "signature" }]);
    assert.ok(url.endsWith("/access-logs")); return Response.json([]);
  });
  return { page, requests, pending, payloads,
    set current(value) { current = value; }, set hold(value) { hold = value; }, set failure(value) { failure = value; },
    set rfidConflict(value) { rfidConflict = value; },
  };
}
await test("Detail keeps history/contract collection/RFID; visual facts exclusively use coherent operational snapshot", async () => {
  const h = detailHarness(); await h.page.flush();
  assert.deepEqual(h.requests.slice().sort(), ["access-logs", "contracts", "history", "operational-status"].map(s => `/api/members/1/${s}`).sort());
  assert.ok(badge(h.page.tree, "BLOQUEADO")); assert.ok(!badge(h.page.tree, "ACTIVO"));
  assert.ok(badge(h.page.tree, "MEMBRESÍA CADUCADA")); assert.ok(badge(h.page.tree, "SIN CONTRATO"));
  assert.match(h.page.text, /Member A/); assert.doesNotMatch(h.page.text, /Wrong name|UNTRUSTED-OPERATIONAL-RFID/);
  assert.ok(badge(h.page.tree, "RFID ASIGNADO"));
  assert.ok(h.page.nodes.some(n => n.props?.href === "/api/contracts/42/pdf"), "Historical PDF remains despite hasContract=false");
  assert.ok(h.page.nodes.some(n => n.props?.className?.includes("text-red-700") && text(n) === new Date(snapshot().member.expiresAt).toLocaleDateString("es-ES")));
  await h.page.click("Editar socio");
  assert.equal(h.page.nodes.find(n => n.props?.id === "member-rfid-code").props.value, "CONFIRMED");
});
for (const label of ["Bloquear socio", "Activar socio", "Renovar 1 año", "Quitar vencimiento"]) {
  await test(`Operational refresh after ${label}`, async () => {
    const h = detailHarness(); await h.page.flush();
    if (label === "Activar socio") await h.page.click("Bloquear socio");
    const before = h.requests.filter(u => u.endsWith("/operational-status")).length;
    h.current = snapshot({ member: { active: true, expiresAt: now.toISOString() }, expired: false, hasContract: true, canWithdraw: false });
    await h.page.click(label);
    assert.equal(h.requests.filter(u => u.endsWith("/operational-status")).length, before + 1);
    assert.ok(badge(h.page.tree, "ACTIVO")); assert.ok(badge(h.page.tree, "CONTRATO"));
    assert.ok(!badge(h.page.tree, "MEMBRESÍA CADUCADA"));
    assert.match(h.page.text, /VÁLIDA HASTA/);
  });
}
await test("Explicit expiration edit refreshes; unrelated edit omits expiresAt", async () => {
  for (const value of [undefined, "2030-01-01", ""]) {
    const h = detailHarness(); await h.page.flush(); await h.page.click("Editar socio");
    if (value !== undefined) h.page.change(n => n.type === "input" && n.props.type === "date", value);
    await h.page.click("Guardar cambios");
    assert.equal(Object.hasOwn(h.payloads[0], "expiresAt"), value !== undefined);
    if (value !== undefined) assert.equal(h.payloads[0].expiresAt, value);
    assert.equal(h.requests.filter(u => u.endsWith("/operational-status")).length, value === undefined ? 1 : 2);
  }
});
await test("RFID change/unassign/assign/conflict still use confirmed evidence independently of operational snapshot", async () => {
  const h = detailHarness(); await h.page.flush(); await h.page.click("Editar socio");
  for (const [code, expected] of [["TAG2", "CONFIRMED"], [null, "TAG2"], ["TAG3", null]]) {
    if (code === null) await h.page.click("Desasignar RFID");
    else {
      h.page.change(n => n.props?.id === "member-rfid-code", code);
      await h.page.click("Guardar RFID");
    }
    assert.deepEqual(h.payloads.at(-1), { rfidCode: code, expectedRfidCode: expected });
    assert.equal(h.page.nodes.find(n => n.props?.id === "member-rfid-code").props.value, code ?? "");
    assert.ok(badge(h.page.tree, "MEMBRESÍA CADUCADA"));
  }
  h.rfidConflict = true;
  h.page.change(n => n.props?.id === "member-rfid-code", "TAG4"); await h.page.click("Guardar RFID");
  assert.equal(h.page.nodes.find(n => n.props?.id === "member-rfid-code").props.value, "OTHER-CONFIRMED");
  assert.match(h.page.text, /No se pudo confirmar la RFID/);
  h.page.change(n => n.props?.id === "member-rfid-code", "TAG5"); await h.page.click("Guardar RFID");
  assert.deepEqual(h.payloads.at(-1), { rfidCode: "TAG5", expectedRfidCode: "OTHER-CONFIRMED" });
  assert.equal(h.requests.filter(u => u.endsWith("/operational-status")).length, 1);
});
await test("Out-of-order operational success/error cannot overwrite newer snapshot", async () => {
  for (const obsoleteError of [false, true]) {
    const h = detailHarness(); await h.page.flush(); h.hold = true;
    await h.page.click("Bloquear socio"); await h.page.click("Activar socio");
    assert.match(h.page.text, /Actualizando estado operativo/);
    const latest = snapshot({ member: { active: true, expiresAt: null }, expired: false, hasContract: true });
    h.pending[1](Response.json(latest)); await h.page.flush();
    h.pending[0](obsoleteError ? Response.json({}, { status: 500 }) : Response.json(snapshot())); await h.page.flush();
    assert.ok(badge(h.page.tree, "ACTIVO")); assert.ok(badge(h.page.tree, "CONTRATO"));
    assert.ok(!badge(h.page.tree, "MEMBRESÍA CADUCADA")); assert.doesNotMatch(h.page.text, /No se pudo actualizar/);
  }
});
await test("Failed refresh retains snapshot and shows error; retry recovers", async () => {
  const h = detailHarness(); await h.page.flush(); h.failure = true;
  await h.page.click("Bloquear socio");
  assert.ok(badge(h.page.tree, "BLOQUEADO")); assert.ok(badge(h.page.tree, "MEMBRESÍA CADUCADA"));
  assert.ok(badge(h.page.tree, "SIN CONTRATO")); assert.match(h.page.text, /último estado confirmado/);
  h.failure = false; h.current = snapshot({ hasContract: true }); await h.page.click("Reintentar");
  assert.ok(badge(h.page.tree, "CONTRATO")); assert.doesNotMatch(h.page.text, /No se pudo actualizar/);
});
await test("Failed explicit-edit refresh preserves snapshot without reload", async () => {
  const h = detailHarness(); await h.page.flush(); h.failure = true;
  await h.page.click("Editar socio"); h.page.change(n => n.type === "input" && n.props.type === "date", "");
  await h.page.click("Guardar cambios");
  assert.equal(h.page.reloads, 0); assert.ok(badge(h.page.tree, "MEMBRESÍA CADUCADA"));
  assert.match(h.page.text, /último estado confirmado/);
});
await test("Initial loading/error never fabricates favorable or unfavorable facts", async () => {
  const pending = [];
  const page = pageHarness("@/app/members/[id]/page", async url => {
    if (url.endsWith("/operational-status")) return new Promise(resolve => pending.push(resolve));
    if (url.endsWith("/history")) return Response.json({ member: api.result[0], sales: [], totalSpent: 0, count: 0 });
    return Response.json([]);
  });
  await page.flush(); assert.match(page.text, /Cargando estado operativo/);
  for (const response of [Response.json({}, { status: 503 }), Response.json({ member: {}, expired: false })]) {
    pending.shift()(response); await page.flush();
    for (const label of ["ACTIVO", "BLOQUEADO", "CONTRATO", "SIN CONTRATO", "MEMBRESÍA CADUCADA"]) assert.ok(!badge(page.tree, label));
    assert.match(page.text, /Estado no disponible/); assert.match(page.text, /No se pudo actualizar/);
    if (!pending.length) await page.click("Reintentar");
  }
  page.unmount(); pending.shift()(Response.json(snapshot())); await page.flush();
  assert.ok(!badge(page.tree, "BLOQUEADO"), "Unmount invalidates pending response");
});
await test("Types and source guards: list-only expired, no local expiry/polling/RFID substitution", () => {
  const detail = read("app/members/[id]/page.tsx"), list = read("app/members/page.tsx"), types = read("lib/types.ts");
  assert.match(types, /type MemberListItem = MemberSummary & \{ expired: boolean \}/);
  assert.doesNotMatch(types.match(/type MemberSummary = \{[\s\S]*?\n\};/)[0], /expired/);
  assert.doesNotMatch(list, /operational-status|Date\.now\(|new Date\(\)/);
  assert.doesNotMatch(detail, /canWithdraw|hasRfid|setInterval|new Date\([^\n]*expiresAt[^\n]*\)\s*</);
  assert.doesNotMatch(detail, /operationalStatus\.member\.rfidCode/);
  assert.match(detail, /if \(expirationEdited\) payload\.expiresAt = editForm\.expiresAt/);
  for (const ref of ["rfidBaseRef", "rfidMutationRef", "rfidVersionRef", "historyRequestRef"]) assert.ok(detail.includes(ref));
});
console.log(`${checks} checks passed. Production code with simulated HTTP/hooks/storage; no real browser or database.`);
