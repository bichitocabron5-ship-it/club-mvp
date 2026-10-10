import { overviewFromOperational } from "./fixtures/member-overview.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { uiHarness, deferred, nodes, text } from "./fixtures/member-document-ui-harness.mjs";

// Production JSX and callbacks with simulated hooks/HTTP. No browser/layout claims.
const props = {
  memberId: 17, memberNumber: "0017", fullName: "María del Carmen García López",
  photo: "photo-slot", operational: { member: { active: true, expiresAt: "2020-01-01T12:00:00Z" }, expired: false, hasContract: true },
  loading: false, error: "", hasRfid: true, editing: false, onToggleEdit() {}, onRetry() {},
};
const header = (overrides = {}) => uiHarness({ path: "components/member-profile-header.tsx", name: "MemberProfileHeader",
  props: { ...props, ...overrides }, fetch() { assert.fail("Header must not fetch"); } });

test("identity, null-only number fallback, slot, routes and callbacks", async () => {
  let edits = 0, retries = 0;
  const h = header({ onToggleEdit() { edits++; }, onRetry() { retries++; }, error: "Error operativo" });
  assert.equal(text(h.nodes.find(n => n.type === "h2")), props.fullName);
  assert.match(h.text, /Socio nº 0017/); assert.match(h.text, /photo-slot/);
  assert.doesNotMatch(h.text, /DNI|teléfono|correo/i);
  const nav = h.nodes.find(n => n.type === "nav");
  assert.equal(nav.props["aria-label"], "Acciones del socio");
  assert.deepEqual(nodes(nav).filter(n => n.type === "a").map(n => n.props.href), ["/members/17/contract", "/sales", "#member-history"]);
  h.button("Editar socio").props.onClick(); h.button("Reintentar").props.onClick();
  assert.equal(edits, 1); assert.equal(retries, 1);
  h.render({ ...props, memberNumber: null, editing: true });
  assert.match(h.text, /Socio nº 17/); assert.equal(h.button("Editando socio").props["aria-expanded"], true);
  h.render({ ...props, memberNumber: "0" }); assert.match(h.text, /Socio nº 0/);
  await h.flush();
});

for (const active of [true, false]) for (const expired of [true, false]) test(`server facts active=${active} expired=${expired}`, () => {
  const h = header({ operational: { member: { active, expiresAt: props.operational.member.expiresAt }, expired, hasContract: false }, hasRfid: false });
  const labels = h.nodes.filter(n => n.type === "span").map(text);
  assert.ok(labels.includes(active ? "ACTIVO" : "BLOQUEADO"));
  assert.equal(labels.includes("MEMBRESÍA CADUCADA"), expired, "Do not calculate expiry from the past date");
  assert.ok(labels.includes("SIN CONTRATO")); assert.ok(labels.includes("RFID PENDIENTE"));
  assert.equal(h.nodes.find(n => n.type === "time").props.dateTime, props.operational.member.expiresAt);
});

test("loading, failed initial read, retained snapshot and no expiration remain distinct", () => {
  const h = header({ operational: null, loading: true });
  assert.match(h.text, /Cargando estado operativo/); assert.doesNotMatch(h.text, /ACTIVO|BLOQUEADO|SIN CONTRATO|Sin vencimiento/);
  h.render({ ...props, operational: null, error: "Error operativo" });
  assert.ok(h.button("Reintentar")); assert.ok(h.nodes.some(n => n.props.role === "alert"));
  assert.doesNotMatch(h.text, /último estado confirmado/);
  h.render({ ...props, error: "Error operativo", loading: true });
  assert.match(h.text, /último estado confirmado/); assert.match(h.text, /Actualizando estado operativo/);
  h.render({ ...props, operational: { ...props.operational, member: { active: true, expiresAt: null } } });
  assert.match(h.text, /Sin vencimiento/); assert.ok(!h.nodes.some(n => n.type === "time"));
});

test("responsive structure preserves all actions and untruncated long identity", () => {
  const fullName = "Nombre".repeat(50), h = header({ fullName, memberNumber: "123".repeat(40) });
  assert.equal(text(h.nodes.find(n => n.type === "h2")), fullName);
  const nav = h.nodes.find(n => n.type === "nav"), actions = nodes(nav).filter(n => ["a", "button"].includes(n.type));
  assert.equal(actions.length, 4);
  for (const n of actions) {
    assert.notEqual(n.props.hidden, true); assert.notEqual(n.props.disabled, true);
    assert.match(n.props.className, /min-h-12/);
  }
  assert.ok(h.nodes.some(n => n.props.className?.includes("xl:grid-cols-[12rem_minmax(0,1fr)_13rem]")));
  assert.match(nav.props.className, /grid-cols-1/);
  assert.doesNotMatch(h.nodes.find(n => n.type === "h2").props.className, /truncate|line-clamp/);
});

const photoProps = { memberId: 17, initialPhotoUrl: "/existing-photo", canUpload: true, variant: "profile" };
const photo = (overrides = {}, fetch = () => assert.fail("No automatic photo fetch")) => uiHarness({
  path: "components/member-photo-card.tsx", name: "MemberPhotoCard", props: { ...photoProps, ...overrides }, fetch,
});
for (const variant of ["card", "profile"]) test(`photo failure is local and preserves URL/actions: ${variant}`, async () => {
  const h = photo({ variant });
  h.nodes.find(n => n.type === "img").props.onError(); h.render();
  assert.equal(h.nodes.filter(n => n.type === "img").length, 0);
  assert.match(h.text, /Foto no disponible/); assert.ok(h.button("Reemplazar foto"));
  assert.equal(h.nodes.find(n => n.type === "a").props.href, "/existing-photo");
  await h.flush(); assert.equal(h.nodes.filter(n => n.type === "img").length, 0);
});
test("missing photo fallback and upload permission", () => {
  const h = photo({ initialPhotoUrl: null }); assert.match(h.text, /Sin foto/); assert.ok(h.button("Subir foto"));
  assert.equal(h.nodes.find(n => n.type === "a").props["aria-disabled"], true);
  const readonly = photo({ canUpload: false });
  assert.equal(readonly.nodes.filter(n => ["button", "input", "a"].includes(n.type)).length, 0);
  assert.equal(readonly.nodes.find(n => n.type === "img").props.src, "/existing-photo");
});
test("photo upload preserves POST, pending, callback, input reset and recovers failed preview", async () => {
  let calls = 0, callbacks = 0, clicks = 0;
  const pending = deferred();
  const h = photo({ onUploaded() { callbacks++; } }, async (url, options) => {
    calls++; assert.equal(url, "/api/members/17/photo"); assert.equal(options.method, "POST");
    assert.equal(options.body.get("image").name, "photo.png"); return pending.promise;
  });
  h.nodes.find(n => n.type === "img").props.onError(); h.render();
  const input = h.nodes.find(n => n.type === "input"), dom = { value: "photo.png", click() { clicks++; } };
  input.props.ref.current = dom;
  h.button("Reemplazar foto").props.onClick(); assert.equal(clicks, 1);
  input.props.onChange({ target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] } }); h.render();
  assert.equal(h.button("Subiendo...").props.disabled, true);
  pending.resolve(Response.json({ photoUrl: "/new-photo" })); await h.flush();
  assert.equal(calls, 1); assert.equal(callbacks, 1); assert.equal(dom.value, "");
  assert.equal(h.nodes.find(n => n.type === "img").props.src, "/new-photo");
});
for (const mode of ["http", "network", "callback"]) test(`photo error preserved: ${mode}`, async () => {
  const h = photo({ onUploaded() { if (mode === "callback") throw new Error("refresh"); } }, async () => {
    if (mode === "network") throw new Error("offline");
    return mode === "http" ? Response.json({ error: "Archivo inválido" }, { status: 400 }) : Response.json({ photoUrl: "/new-photo" });
  });
  h.nodes.find(n => n.type === "input").props.onChange({ target: { files: [new File(["x"], "photo.png")] } }); await h.flush();
  assert.ok(h.nodes.some(n => n.props.role === "alert")); assert.equal(h.button("Reemplazar foto").props.disabled, false);
  assert.equal(h.nodes.find(n => n.type === "img").props.src, mode === "callback" ? "/new-photo" : "/existing-photo");
});

for (const [role, status] of [["ADMIN", "authenticated"], ["STAFF", "authenticated"], ["ADMIN", "loading"]]) test(`page integration role=${role} status=${status}`, async () => {
  const calls = [], member = { id: 17, memberNumber: "0017", fullName: props.fullName, dni: "PRIVATE-DNI", active: true, expiresAt: null,
    photoUrl: null, rfidCode: "TAG", hasDniFront: true, hasDniBack: true };
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", mocks: {
    "next-auth/react": { useSession: () => ({ status, data: { user: { role } } }) },
    "next/navigation": { useParams: () => ({ id: "17" }) },
    "@/components/member-documents-card": { MemberDocumentsCard: "documents-card" },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async url => {
    calls.push(url);
    if (url.endsWith("/history")) return Response.json({ member, sales: [], count: 0, totalSpent: 0 });
    if (url.endsWith("/overview")) return Response.json(overviewFromOperational({ member: { active: false, expiresAt: null }, expired: false, hasContract: false }, 17));
    return Response.json([]);
  } });
  await h.flush();
  assert.equal(calls.length, 4); assert.ok(calls.every(url => !url.includes("operational-status")));
  assert.equal(Boolean(h.button("Activar socio")), role === "ADMIN" && status !== "loading");
  assert.equal(Boolean(h.button("Renovar 1 año")), role === "ADMIN" && status !== "loading");
  assert.equal(Boolean(h.button("Quitar vencimiento")), role === "ADMIN" && status !== "loading");
  assert.equal(Boolean(h.button("Subir foto")), status !== "loading");
  assert.ok(!h.button("Bloquear socio"));
  const top = h.nodes.find(n => n.type === "header"); assert.doesNotMatch(text(top), /PRIVATE-DNI/); assert.match(h.text, /PRIVATE-DNI/);
  const docs = h.nodes.find(n => n.type === "documents-card");
  assert.equal(docs.props.canUpload, status !== "loading");
  assert.equal(docs.props.initialFrontUrl, "/api/members/17/documents?side=front");
  assert.equal(docs.props.initialBackUrl, "/api/members/17/documents?side=back");
  assert.ok(h.nodes.some(n => n.props.id === "member-history"));
  h.button("Editar socio").props.onClick(); h.render();
  assert.ok(h.button("Guardar cambios")); assert.ok(h.button("Guardar RFID"));
  h.button("Cancelar").props.onClick(); h.render(); assert.ok(!h.button("Guardar cambios"));
  assert.equal(calls.length, 4); h.unmount();
});

test("header owns no I/O, state, role policy or expiry calculation", () => {
  const source = readFileSync(new URL("../components/member-profile-header.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(fetch|useState|useEffect|useSession|setInterval)\s*\(|Date\.now\(|\/overview|ADMIN|STAFF/);
});
