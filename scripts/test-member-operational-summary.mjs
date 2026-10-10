import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { uiHarness, deferred, text } from "./fixtures/member-document-ui-harness.mjs";
import { overviewFixture } from "./fixtures/member-overview.mjs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const base = overviewFixture();
const summary = (props = {}) => uiHarness({ path: "components/member-operational-summary.tsx", name: "MemberOperationalSummary",
  props: { overview: base, loading: false, error: "", onRetry() {}, ...props }, fetch() { assert.fail("Presentational component must not fetch"); } });

test("six real indicators; raw consumption precision; server eligibility and reasons without inference", () => {
  const overview = structuredClone(base);
  overview.operational.canWithdraw = false; // deliberately contradicts other flags
  overview.operational.reasons.expired = true;
  overview.access.lastEvent = { type: "UNKNOWN".repeat(80), createdAt: "2026-10-02T10:00:00Z" };
  const h = summary({ overview });
  assert.deepEqual(h.nodes.filter(n => n.type === "h4").map(text), ["Membresía", "Contrato", "Consumo mensual", "RFID", "Documentación", "Último acceso"]);
  assert.match(h.text, /elegibilidad básica: No cumple/); assert.match(h.text, /Membresía caducada/);
  assert.match(h.text, /2\.3456789 g consumidos/); assert.match(h.text, /Límite mensual: 25 g/);
  assert.match(h.text, /DNI frontal: DisponibleDNI reverso: No disponible/);
  assert.ok(h.text.includes(overview.access.lastEvent.type));
  assert.doesNotMatch(h.text, /restantes|dentro del club|fuera del club|contrato vigente|documentación verificada|venta autorizada/i);
  assert.equal(h.nodes.filter(n => n.type === "a").length, 0);
});

test("null contract/expiration/limit/event, zero limit/consumption, partial and absent documents", () => {
  const overview = structuredClone(base);
  overview.contract = null; overview.operational.hasContract = false; overview.operational.hasRfid = false;
  overview.consumption.monthlyGrams = 0; overview.consumption.monthlyLimitG = null;
  overview.documentation = { hasDniFront: false, hasDniBack: false };
  const h = summary({ overview });
  for (const value of ["Sin vencimiento", "Sin contrato firmado", "Sin registro de firma", "Sin asignar", "0 g consumidos", "Límite mensual no indicado", "Sin registros de acceso", "DNI frontal: No disponible", "DNI reverso: No disponible"]) assert.ok(h.text.includes(value), value);
  overview.consumption.monthlyLimitG = 0;
  assert.match(summary({ overview }).text, /Límite mensual: 0 g/);
});

test("loading, error, empty and retry never expose previous facts", () => {
  for (const props of [{ loading: true }, { error: "No disponible" }, { overview: null }]) {
    let retries = 0;
    const h = summary({ ...props, onRetry() { retries++; } });
    assert.equal(h.nodes.filter(n => n.type === "article").length, 0);
    assert.ok(h.nodes.some(n => ["alert", "status"].includes(n.props.role)));
    if (!props.loading) { h.button("Reintentar resumen").props.onClick(); assert.equal(retries, 1); }
  }
});

test("static responsive: one column at 320/375, two at tablet, three desktop; wrapping and no fixed widths", () => {
  const h = summary();
  assert.ok(h.nodes.some(n => /grid-cols-1.*md:grid-cols-2.*xl:grid-cols-3/.test(n.props.className)));
  for (const node of h.nodes.filter(n => n.type === "article")) {
    assert.match(node.props.className, /min-w-0/); assert.match(node.props.className, /overflow-wrap:anywhere/);
  }
  const source = read("components/member-operational-summary.tsx");
  assert.doesNotMatch(source, /\b(fetch|useEffect|useState|useSession|setInterval)\s*\(|Date\.now|Math\.|toFixed|truncate|line-clamp|min-w-\[|w-\[/);
});

function loader(fetch) {
  const exports = {}, states = [];
  vm.runInNewContext(ts.transpileModule(read("lib/member-overview-loader.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, fetch, require: createRequire(import.meta.url) });
  return { instance: exports.createMemberOverviewLoader("1", state => states.push(state)), states };
}

test("single in-flight request; forced mutation supersedes old success/error; unmount ignores results", async () => {
  for (const oldError of [false, true]) {
    const requests = [];
    const { instance, states } = loader((url, options) => {
      assert.equal(url, "/api/members/1/overview"); assert.equal(options.cache, "no-store");
      const d = deferred(); requests.push(d); return d.promise;
    });
    const first = instance.refresh(); assert.equal(instance.refresh(), first); assert.equal(requests.length, 1);
    const second = instance.refresh(true); assert.equal(states.at(-1).snapshot, null);
    const latest = overviewFixture({ consumption: { ...base.consumption, monthlyGrams: 8 } });
    requests[1].resolve(Response.json(latest)); assert.equal(await second, true);
    requests[0].resolve(oldError ? Response.json({}, { status: 500 }) : Response.json(base)); await first;
    assert.equal(states.at(-1).snapshot.consumption.monthlyGrams, 8);
    const third = instance.refresh(); instance.dispose(); const count = states.length;
    requests[2].resolve(Response.json(base)); await third; assert.equal(states.length, count);
  }
});

test("HTTP permissions/errors, malformed DTO and wrong member are isolated; retry and empty recover", async () => {
  for (const response of [Response.json({}, { status: 401 }), Response.json({}, { status: 403 }), Response.json({}, { status: 500 }), Response.json({}), Response.json(overviewFixture({ identity: { ...base.identity, id: 2 } }))]) {
    let current = response;
    const { instance, states } = loader(async () => current);
    assert.equal(await instance.refresh(), false); assert.ok(states.at(-1).error); assert.equal(states.at(-1).snapshot, null);
    current = Response.json(base); assert.equal(await instance.refresh(), true); assert.ok(states.at(-1).snapshot);
    current = Response.json(null); assert.equal(await instance.refresh(true), true); assert.equal(states.at(-1).snapshot, null); assert.equal(states.at(-1).error, "");
  }
});

for (const role of ["STAFF", "ADMIN"]) test(`page shares overview, keeps sections and permissions, refreshes DNI and external return: ${role}`, async () => {
  const calls = [], win = new EventTarget(), doc = new EventTarget(); doc.visibilityState = "visible";
  let consumption = 2, fail = false;
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", globals: { window: win, document: doc }, mocks: {
    "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role } } }) },
    "next/navigation": { useParams: () => ({ id: "1" }) },
    "@/components/member-documents-card": { MemberDocumentsCard: "documents-card" },
    "@/components/member-photo-card": { MemberPhotoCard: "photo-card" },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async url => {
    calls.push(url);
    if (url.endsWith("/overview")) return fail ? Response.json({}, { status: 403 }) : Response.json(overviewFixture({ consumption: { ...base.consumption, monthlyGrams: consumption } }));
    if (url.endsWith("/history")) return Response.json({ member: { id: 1, fullName: "History name", active: false, expiresAt: null, rfidCode: null, hasDniFront: true, hasDniBack: false }, sales: [], count: 0, totalSpent: 0 });
    return Response.json([]);
  } });
  await h.flush(); assert.equal(calls.length, 4); assert.ok(!calls.some(url => url.endsWith("/operational-status")));
  assert.equal(Boolean(h.button("Bloquear socio")), role === "ADMIN");
  assert.ok(h.nodes.some(n => n.type === "documents-card")); assert.ok(h.nodes.some(n => n.props.id === "member-history"));
  h.nodes.find(n => n.type === "documents-card").props.onChanged(); await h.flush();
  assert.equal(calls.filter(url => url.endsWith("/overview")).length, 2);
  consumption = 7;
  win.dispatchEvent(new Event("blur")); doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); win.dispatchEvent(new Event("focus")); await h.flush();
  assert.equal(calls.filter(url => url.endsWith("/overview")).length, 3); assert.match(h.text, /7 g consumidos/);
  fail = true; win.dispatchEvent(new Event("blur")); win.dispatchEvent(new Event("focus")); await h.flush();
  assert.doesNotMatch(h.text, /7 g consumidos/); assert.ok(h.nodes.some(n => n.type === "documents-card"));
  fail = false; h.button("Reintentar resumen").props.onClick(); await h.flush(); assert.match(h.text, /7 g consumidos/);
  const count = calls.length; h.unmount(); win.dispatchEvent(new Event("blur")); win.dispatchEvent(new Event("focus")); assert.equal(calls.length, count);
});

test("documentation notifies confirmed writes and uncertain-write reconciliation without duplicate POST", async () => {
  for (const uncertain of [false, true]) {
    let callbacks = 0, posts = 0;
    const h = uiHarness({ props: { memberId: 1, initialFrontUrl: null, initialBackUrl: null, canUpload: true, onChanged() { callbacks++; } }, fetch: async (url, options) => {
      if (options?.method === "POST") { posts++; if (uncertain) throw new Error("offline after write"); return Response.json({}); }
      return Response.json({ items: [], nextCursor: null });
    } });
    await h.flush(); h.button("Incorporar frontal").props.onClick(); h.render();
    h.nodes.find(n => n.props.type === "file").props.onChange({ target: { files: [new File(["data"], "dni.png", { type: "image/png" })] } });
    h.nodes.find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); await h.flush();
    assert.equal(callbacks, 1); assert.equal(posts, 1);
    if (uncertain) { await h.button("Actualizar documentación").props.onClick(); await h.flush(); assert.equal(callbacks, 2); assert.equal(posts, 1); }
    h.unmount();
  }
});

// Review regressions: route ownership, bfcache event ordering and failed RFID reconciliation.
function reviewPage() {
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = "visible";
  const state = { id: "1", overview: overviewFixture(), hold: false, historyFails: false, conflict: false };
  const requests = [], pending = [];
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", globals: { window: win, document: doc }, mocks: {
    "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role: "ADMIN" } } }) },
    "next/navigation": { useParams: () => ({ id: state.id }) },
    "@/components/member-documents-card": { MemberDocumentsCard: "documents-card" },
    "@/components/member-photo-card": { MemberPhotoCard: "photo-card" },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async (url, options) => {
    requests.push(url);
    if (options?.method === "PATCH") return state.conflict ? Response.json({}, { status: 409 }) : Response.json({ rfidCode: "TAG" });
    if (url.endsWith("/overview")) {
      if (state.hold) { const d = deferred(); pending.push(d); return d.promise; }
      return Response.json(state.overview);
    }
    if (url.endsWith("/history")) return state.historyFails ? Response.json({}, { status: 503 }) : Response.json({
      member: { id: Number(state.id), fullName: `History ${state.id}`, memberNumber: state.id, active: true, expiresAt: null, rfidCode: null },
      sales: [], count: 0, totalSpent: 0,
    });
    return Response.json([]);
  } });
  const event = (name, persisted = false) => { const e = new Event(name); Object.defineProperty(e, "persisted", { value: persisted }); win.dispatchEvent(e); };
  return { h, state, requests, pending, win, doc, event };
}

test("review B/F: member change isolates late old success/error and removes old listeners", async () => {
  for (const oldError of [false, true]) {
    const { h, state, requests, pending, event } = reviewPage();
    await h.flush(); state.hold = true;
    h.nodes.find(n => n.type === "documents-card").props.onChanged(); await h.flush();
    state.id = "2"; state.hold = false;
    state.overview = overviewFixture({ identity: { ...base.identity, id: 2, fullName: "Member Two" }, consumption: { ...base.consumption, monthlyGrams: 42 } });
    h.render(); await h.flush();
    assert.match(h.text, /Member Two/); assert.match(h.text, /42 g consumidos/);
    const before = requests.length;
    pending[0].resolve(oldError ? Response.json({}, { status: 503 }) : Response.json(base)); await h.flush();
    assert.match(h.text, /Member Two/); assert.match(h.text, /42 g consumidos/); assert.equal(h.lateUpdates, 0);
    event("blur"); event("focus"); await h.flush();
    assert.deepEqual(requests.slice(before), ["/api/members/2/overview"]);
    h.unmount(); const after = requests.length; event("blur"); event("focus"); assert.equal(requests.length, after);
  }
});

test("review H: bfcache return from TPV refreshes once in either event order, including no visibility events", async () => {
  for (const order of ["visible-first", "pageshow-first", "pageshow-only"]) {
    const { h, state, requests, doc, event } = reviewPage(); await h.flush();
    event("pagehide", true);
    if (order !== "pageshow-only") { doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); }
    state.overview = overviewFixture({ consumption: { ...base.consumption, monthlyGrams: 19 } });
    const before = requests.length;
    doc.visibilityState = "visible";
    if (order === "visible-first") doc.dispatchEvent(new Event("visibilitychange"));
    event("pageshow", true);
    if (order === "pageshow-first") doc.dispatchEvent(new Event("visibilitychange"));
    event("focus"); await h.flush();
    assert.deepEqual(requests.slice(before), ["/api/members/1/overview"], order);
    assert.match(h.text, /19 g consumidos/); h.unmount();
  }
});

test("review RFID: conflict invalidates overview even if history reconciliation fails", async () => {
  const { h, state, requests } = reviewPage(); await h.flush();
  state.overview = overviewFixture({ operational: { ...base.operational, hasRfid: false } });
  h.nodes.find(n => n.type === "documents-card").props.onChanged(); await h.flush();
  assert.match(h.text, /Sin asignar/);
  state.overview = base; state.conflict = true; state.historyFails = true;
  h.button("Editar socio").props.onClick(); h.render();
  h.nodes.find(n => n.props.id === "member-rfid-code").props.onChange({ target: { value: "NEW" } }); h.render();
  const before = requests.filter(url => url.endsWith("/overview")).length;
  await h.button("Guardar RFID").props.onClick(); await h.flush();
  assert.equal(requests.filter(url => url.endsWith("/overview")).length, before + 1);
  assert.match(h.text, /RFID ASIGNADO/); assert.match(h.text, /No se pudo recuperar un estado RFID fiable/);
  h.unmount();
});

test("review D/G: pending read and two rapid confirmed status mutations retain only latest generation", async () => {
  const { h, state, pending } = reviewPage(); await h.flush(); state.hold = true;
  h.nodes.find(n => n.type === "documents-card").props.onChanged(); await h.flush();
  await h.button("Renovar 1 año").props.onClick(); await h.flush();
  await h.button("Quitar vencimiento").props.onClick(); await h.flush();
  assert.equal(pending.length, 3);
  pending[1].resolve(Response.json(base)); pending[0].resolve(Response.json({}, { status: 503 })); await h.flush();
  assert.match(h.text, /Cargando resumen operativo/); assert.doesNotMatch(h.text, /g consumidos/);
  pending[2].resolve(Response.json(overviewFixture({ consumption: { ...base.consumption, monthlyGrams: 33 } }))); await h.flush();
  assert.match(h.text, /33 g consumidos/); h.unmount();
});
