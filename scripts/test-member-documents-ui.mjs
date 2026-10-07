import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { uiHarness, deferred, tick } from "./fixtures/member-document-ui-harness.mjs";
const types = ["ID_FRONT", "ID_BACK", "AUTHORIZATION", "PROOF", "ANNEX", "OTHER"];
const labels = ["DNI frontal", "DNI reverso", "Autorización", "Justificante", "Anexo", "Otro"];
const row = (type = "ID_FRONT", id = 1, mimeType = "image/png") => ({ id, type, mimeType, originalName: "<b>document.pdf</b>", byteLength: 1500, createdAt: "2026-10-06T12:00:00Z", isCurrent: true });
const list = items => Response.json({ items, nextCursor: null });
const props = { memberId: 17, initialFrontUrl: null, initialBackUrl: null, canUpload: true };
const start = fetch => uiHarness({ props, fetch });
const inputs = h => h.nodes.filter(n => n.type === "input" && n.props.type === "file");
const send = (input) => input.props.onChange({ target: { files: [new File(["x"], "id.png", { type: "image/png" })], value: "id.png" } });

test("current loading, error, retry, empty and six neutral slots", async () => {
  const pending = deferred(); let count = 0;
  const h = start((url, options) => { assert.equal(url, "/api/members/17/member-documents?view=current"); assert.equal(options.cache, "no-store"); return ++count === 1 ? pending.promise : Promise.resolve(list([])); });
  assert.match(h.text, /Cargando documentación…/); assert.equal(h.nodes.filter(n => n.type === "article").length, 0);
  pending.resolve(Response.json({ error: "fail" }, { status: 500 })); await h.flush();
  assert.match(h.text, /No se pudo cargar la documentación\./); assert.doesNotMatch(h.text, /Sin documento incorporado/);
  h.button("Reintentar").props.onClick(); await h.flush();
  assert.match(h.text, /No hay documentos incorporados al expediente\./);
  assert.equal(h.nodes.filter(n => n.type === "article").length, 6);
  assert.equal(h.text.match(/Sin documento incorporado/g).length, 6);
  assert.doesNotMatch(h.text, /Pendiente|DOCUMENTACIÓN COMPLETA/);
});

test("all types ordered, MIME determines preview, real canonical links and accessible labels", async () => {
  const rows = types.map((type, i) => row(type, i + 1, i % 2 ? "application/pdf" : "image/png"));
  const h = start(async () => list([...rows].reverse())); await h.flush();
  assert.deepEqual(h.nodes.filter(n => n.type === "h4").map(n => n.props.children), labels);
  assert.equal(h.nodes.filter(n => n.type === "img").length, 3);
  assert.match(h.text, /DNI: ambas caras adjuntadas/);
  for (const document of rows) {
    const base = `/api/members/17/member-documents/${document.id}/content?disposition=`;
    const open = h.nodes.find(n => n.type === "a" && n.props.href === base + "inline");
    assert.equal(open.props.target, "_blank"); assert.equal(open.props.rel, "noopener noreferrer"); assert.ok(open.props["aria-label"]);
    assert.ok(h.nodes.find(n => n.type === "a" && n.props.href === base + "attachment"));
    assert.equal(h.nodes.some(n => n.type === "img" && n.props.src === base + "inline"), document.mimeType === "image/png");
  }
  assert.equal(h.nodes.filter(n => n.type === "b").length, 0);
  for (const input of inputs(h)) assert.ok(h.nodes.find(n => n.type === "label" && n.props.htmlFor === input.props.id));
  assert.ok(h.nodes.some(n => n.props?.["aria-busy"] === true));
  assert.ok(h.nodes.filter(n => n.type === "a").every(n => !/storage|signed|token|#/.test(n.props.href)));
});

for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) test(`preview ${mime}, own error preserves canonical document and never activates legacy`, async () => {
  const h = uiHarness({ props: { ...props, initialFrontUrl: "/api/members/17/documents?side=front" }, fetch: async () => list([row("ID_FRONT", 1, mime)]) }); await h.flush();
  assert.match(h.text, /DNI: una cara adjuntada/); assert.doesNotMatch(h.text, /compatibilidad/);
  const img = h.nodes.find(n => n.type === "img");
  if (mime === "application/pdf") assert.equal(img, undefined);
  else { img.props.onError(); h.render(); assert.match(h.text, /No se pudo cargar la vista previa\./); }
  assert.equal(h.nodes.filter(n => n.type === "a").length, 2); assert.doesNotMatch(h.text, /compatibilidad/);
});

test("legacy signals follow props and remain informational only", async () => {
  const h = start(async () => list([])); await h.flush();
  h.render({ ...props, initialBackUrl: "https://legacy.invalid/private" });
  assert.match(h.text, /Hay un DNI de compatibilidad/); assert.equal(h.nodes.filter(n => n.type === "a" || n.type === "img").length, 0);
  h.render(props); assert.doesNotMatch(h.text, /compatibilidad/);
});

for (const side of ["front", "back"]) test(`upload ${side}: synchronous lock, both disabled, only local refresh`, async () => {
  const pending = deferred(); const calls = []; let items = [];
  const h = start(async (url, options) => { calls.push(url); if (options.method === "POST") {
    assert.equal(url, "/api/members/17/dni"); assert.equal(options.body.get("side"), side);
    assert.deepEqual([...options.body.keys()], ["side", "image"]); return pending.promise;
  } return list(items); }); await h.flush();
  const files = inputs(h); send(files[side === "front" ? 0 : 1]); send(files[0]); send(files[1]);
  h.render(); assert.ok(inputs(h).every(n => n.props.disabled)); assert.equal(calls.filter(u => u.endsWith("/dni")).length, 1);
  items = [row(side === "front" ? "ID_FRONT" : "ID_BACK")]; pending.resolve(new Response(null, { status: 200 })); await h.flush();
  assert.match(h.text, /Documento incorporado\./); assert.equal(h.nodes.filter(n => n.type === "a").length, 2);
  assert.equal(calls.length, 3); assert.ok(calls.every(u => !/history|contracts/.test(u)));
});

for (const mode of ["rejected", "uncertain", "refreshFailed"]) test(`upload ${mode}: accurate message and zero retry`, async () => {
  let posts = 0, gets = 0;
  const h = start(async (url, options) => {
    if (options.method === "POST") { posts++; if (mode === "uncertain") throw new Error("network"); return mode === "rejected" ? Response.json({ error: "UNSUPPORTED_MIME" }, { status: 415 }) : list([]); }
    if (++gets > 1 && mode === "refreshFailed") throw new Error("refresh"); return list([]);
  }); await h.flush(); send(inputs(h)[0]); await h.flush();
  assert.match(h.text, mode === "rejected" ? /Selecciona una imagen JPG, PNG o WEBP/ : mode === "uncertain" ? /No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir./ : /Documento incorporado. No se pudo actualizar el listado./);
  assert.doesNotMatch(h.text, /No se pudo subir/); assert.equal(posts, 1); await h.flush(); assert.equal(posts, 1);
  assert.ok(h.nodes.some(n => n.props?.role === "alert"));
});

for (const oldError of [false, true]) test(`stale ${oldError ? "error" : "response"} and finally cannot clear new loading`, async () => {
  const old = deferred(), fresh = deferred(); let gets = 0; const signals = [];
  const h = start((url, options) => { if (options.method === "POST") return Promise.resolve(list([])); signals.push(options.signal); return ++gets === 1 ? Promise.resolve(list([])) : gets === 2 ? old.promise : fresh.promise; });
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(inputs(h)[0]); await tick(); h.render();
  assert.equal(signals[1].aborted, true);
  if (oldError) old.reject(new Error("old")); else old.resolve(list([row("OTHER", 88)]));
  await h.flush(); assert.match(h.text, /Cargando documentación…/); assert.doesNotMatch(h.text, /No se pudo cargar la documentación/);
  fresh.resolve(list([row("ID_FRONT", 99)])); await h.flush();
  assert.ok(h.nodes.some(n => n.props?.href?.includes("/99/content"))); assert.ok(!h.nodes.some(n => n.props?.href?.includes("/88/content")));
});

test("older success arriving after newest response is ignored", async () => {
  const old = deferred(); let gets = 0;
  const h = start((url, options) => options.method === "POST" ? Promise.resolve(list([])) : ++gets === 1 ? Promise.resolve(list([])) : gets === 2 ? old.promise : Promise.resolve(list([row("ID_BACK", 42)])));
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(inputs(h)[0]); await h.flush(); old.resolve(list([])); await h.flush();
  assert.ok(h.nodes.some(n => n.props?.href?.includes("/42/content")));
});

test("member change/unmount abort and isolate reads and pending POST callbacks", async () => {
  const pending = deferred(), upload = deferred(); const calls = [], signals = [];
  const h = start((url, options) => { calls.push(url); signals.push(options.signal); return options.method === "POST" ? upload.promise : url.includes("/18/") ? pending.promise : Promise.resolve(list([])); });
  await h.flush(); send(inputs(h)[0]); h.render({ ...props, memberId: 18 });
  upload.resolve(list([])); await h.flush(); assert.equal(calls.filter(u => u.includes("/17/member-documents")).length, 1);
  h.unmount(); assert.equal(signals.at(-1).aborted, true); pending.reject(new Error("late")); await tick();
});

const member = { id: 17, fullName: "Socio test", dni: "DOC", active: true, rfidCode: null, expiresAt: null };
for (const mode of ["http", "network", "badPayload", "secondaryHttp", "secondaryNetwork"]) test(`member initial load ${mode}: no infinite loading or error payload as member`, async () => {
  let parsedError = false;
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", mocks: {
    "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role: "STAFF" } } }) },
    "next/navigation": { useParams: () => ({ id: "17" }) },
    "@/components/member-documents-card": { MemberDocumentsCard: () => null },
    "@/components/member-photo-card": { MemberPhotoCard: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async url => {
    if (url.endsWith("/operational-status")) return Response.json({ member, expired: false, hasContract: false });
    if (url.endsWith("/history")) {
      if (mode === "network") throw new Error("network");
      if (mode === "http") return { ok: false, json() { parsedError = true; return { error: "bad" }; } };
      return Response.json(mode === "badPayload" ? { error: "bad" } : { member, sales: [], totalSpent: 0, count: 0 });
    }
    if (mode === "secondaryNetwork") throw new Error("secondary");
    return mode === "secondaryHttp" ? Response.json({ error: "bad" }, { status: 500 }) : Response.json([]);
  } }); await h.flush();
  assert.equal(parsedError, false); assert.doesNotMatch(h.text, /Cargando\.\.\./);
  if (mode.startsWith("secondary")) { assert.match(h.text, /Socio test/); assert.match(h.text, /No se pudieron cargar los contratos/); assert.match(h.text, /No se pudieron cargar los accesos/); }
  else assert.match(h.text, /No se pudo cargar la ficha del socio/);
});

test("document source has no legacy URL state, general upload/history or sensitive client fields", () => {
  const source = readFileSync(new URL("../components/member-documents-card.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /storageBucket|storageKey|sha256|signedUrl|view=all|nextCursor=|onUploaded|setFrontUrl|setBackUrl/);
});

test("confirmed upload followed by failed current must not claim old absences", async () => {
  let gets = 0;
  const h = start(async (url, options) => options.method === "POST" ? new Response(null, { status: 200 }) : ++gets === 1 ? list([]) : Response.json({ error: "failed" }, { status: 500 }));
  await h.flush(); send(inputs(h)[0]); await h.flush();
  assert.match(h.text, /Documento incorporado. No se pudo actualizar el listado./);
  assert.doesNotMatch(h.text, /No hay documentos incorporados|Sin documento incorporado/);
});

test("legacy alone never counts towards canonical DNI copy", async () => {
  const h = uiHarness({ props: { ...props, initialFrontUrl: "/legacy/front", initialBackUrl: "/legacy/back" }, fetch: async () => list([]) });
  await h.flush(); assert.match(h.text, /DNI de compatibilidad/); assert.doesNotMatch(h.text, /DNI: (ambas caras|una cara)/);
});

for (const abort of [false, true]) test(`old ${abort ? "AbortError" : "error"} after new success is ignored`, async () => {
  let gets = 0; const old = deferred();
  const h = start((url, options) => options.method === "POST" ? Promise.resolve(list([])) : ++gets === 1 ? Promise.resolve(list([])) : gets === 2 ? old.promise : Promise.resolve(list([row("ID_FRONT", 44)])));
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(inputs(h)[0]); await h.flush();
  old.reject(Object.assign(new Error("old"), { name: abort ? "AbortError" : "Error" })); await h.flush();
  assert.doesNotMatch(h.text, /No se pudo cargar la documentación|Cargando documentación/);
  assert.ok(h.nodes.some(n => n.props?.href?.includes("/44/content")));
});

for (const resolve of [false, true]) test(`unmount late current ${resolve ? "success" : "failure"} makes no state updates`, async () => {
  const pending = deferred(); let signal;
  const h = start((url, options) => { signal = options.signal; return pending.promise; });
  h.unmount(); assert.equal(signal.aborted, true);
  if (resolve) pending.resolve(list([row()])); else pending.reject(new Error("late"));
  await tick(); assert.equal(h.lateUpdates, 0);
});

for (const mode of ["success", "rejected", "uncertain", "refreshFailed"]) test(`upload lock released after ${mode} only explicit next event starts another POST`, async () => {
  let posts = 0, gets = 0;
  const h = start(async (url, options) => {
    if (options.method === "POST") { posts++; if (mode === "uncertain") throw new Error("network"); return mode === "rejected" ? Response.json({ error: "UNSUPPORTED_MIME" }, { status: 415 }) : new Response(null, { status: 200 }); }
    return ++gets > 1 && mode === "refreshFailed" ? Response.json({ error: "failed" }, { status: 500 }) : list([]);
  }); await h.flush(); send(inputs(h)[0]); await h.flush();
  assert.ok(inputs(h).every(n => !n.props.disabled)); assert.equal(posts, 1);
  send(inputs(h)[1]); await h.flush(); assert.equal(posts, 2);
});

test("whole page upload preserves unrelated state and never calls general refresh", async () => {
  const calls = [];
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", mocks: {
    "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role: "STAFF" } } }) },
    "next/navigation": { useParams: () => ({ id: "17" }) },
    "@/components/member-photo-card": { MemberPhotoCard: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async (url, options) => {
    calls.push(url);
    if (options?.method === "POST") return new Response(null, { status: 200 });
    if (url.endsWith("/operational-status")) return Response.json({ member, expired: false, hasContract: false });
    if (url.endsWith("/history")) return Response.json({ member, sales: [], totalSpent: 0, count: 0 });
    return url.includes("member-documents?") ? list([]) : Response.json([]);
  } }); await h.flush();
  h.button("Editar socio").props.onClick(); h.render(); assert.ok(h.button("Guardar cambios"));
  const before = calls.length; send(inputs(h)[0]); await h.flush();
  assert.deepEqual(calls.slice(before), ["/api/members/17/dni", "/api/members/17/member-documents?view=current"]);
  assert.ok(h.button("Guardar cambios"));
});
