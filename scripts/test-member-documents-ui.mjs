import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { uiHarness, deferred, tick, nodes, text } from "./fixtures/member-document-ui-harness.mjs";
const types = ["ID_FRONT", "ID_BACK", "AUTHORIZATION", "PROOF", "ANNEX", "OTHER"];
const labels = ["DNI frontal", "DNI reverso", "Autorización", "Justificante", "Anexo", "Otro"];
const row = (type = "ID_FRONT", id = 1, mimeType = "image/png") => ({ id, type, mimeType, originalName: "<b>document.pdf</b>", byteLength: 1500, createdAt: "2026-10-06T12:00:00Z", isCurrent: true });
const list = items => Response.json({ items, nextCursor: null });
const props = { memberId: 17, initialFrontUrl: null, initialBackUrl: null, canUpload: true };
const start = fetch => uiHarness({ props, fetch });
const inputs = h => h.nodes.filter(n => n.type === "input" && n.props.type === "file");
const submit = h => h.nodes.find(n => n.type === "form" && n.props.onSubmit).props.onSubmit({ preventDefault() {} });
const send = (h, side = "front") => {
  h.nodes.find(n => n.type === "select" && n.props.id === "document-type-17").props.onChange({ target: { value: side === "front" ? "ID_FRONT" : "ID_BACK" } });
  inputs(h)[0].props.onChange({ target: { files: [new File(["x"], "id.png", { type: "image/png" })], value: "id.png" } });
  submit(h);
};
const history = h => h.nodes.find(n => n.props?.id === `document-history-17`);
const page = (items, nextCursor = null) => Response.json({ items, nextCursor });
const openHistory = h => { h.button("Ver histórico").props.onClick(); h.render(); };

test("pre-upload refresh cannot unlock a later uncertain POST", async () => {
  const old = deferred(); let gets = 0, posts = 0;
  const h = start(async (url, options) => {
    if (options.method === "POST") { posts++; throw new Error("network"); }
    return ++gets === 2 ? old.promise : list([]);
  }); await h.flush();
  h.button("Actualizar documentación").props.onClick(); send(h); await h.flush();
  old.resolve(list([])); await h.flush();
  assert.equal(h.button("Incorporar documento").props.disabled, true);
  h.button("Incorporar reverso").props.onClick(); submit(h); await h.flush(); assert.equal(posts, 1);
  await h.button("Actualizar documentación").props.onClick(); await h.flush();
  assert.equal(h.button("Incorporar documento").props.disabled, false);
});

test("file DOM reset permits selecting the same file again", async () => {
  let posts = 0;
  const h = start(async (url, options) => { if (options.method === "POST") posts++; return list([]); }); await h.flush();
  const dom = { value: "", focus() {} }, file = new File(["x"], "same.png", { type: "image/png" });
  inputs(h)[0].props.ref.current = dom;
  h.nodes.find(n => n.type === "select").props.onChange({ target: { value: "OTHER" } });
  function selectSameFile() {
    // Model native change suppression when the same selected path is retained.
    if (dom.value === "same.png") return;
    dom.value = "same.png";
    inputs(h)[0].props.onChange({ target: { files: [file] } });
  }
  selectSameFile(); submit(h); await h.flush(); assert.equal(dom.value, "");
  selectSameFile(); submit(h); await h.flush(); assert.equal(posts, 2); assert.equal(dom.value, "");
});

test("general form render labels help six types available on current failure", async () => {
  const h = start(async () => new Response(null, { status: 500 })); await h.flush();
  const select = h.nodes.find(n => n.type === "select"), input = inputs(h)[0];
  assert.equal(inputs(h).length, 1);
  assert.deepEqual(h.nodes.filter(n => n.type === "option" && n.props.value).map(n => n.props.value), types);
  assert.equal(input.props.accept, "image/jpeg,image/png,image/webp,application/pdf");
  for (const control of [select, input]) {
    assert.equal(control.props.required, true);
    assert.ok(h.nodes.some(n => n.type === "label" && n.props.htmlFor === control.props.id));
    assert.ok(h.nodes.some(n => n.props?.id === control.props["aria-describedby"]));
  }
  assert.match(h.text, /Formatos admitidos: JPEG, PNG, WEBP y PDF. Tamaño máximo: 5 MiB./);
  assert.equal(h.button("Incorporar documento").props.type, "submit");
  assert.doesNotMatch(h.text, /Se conservarán/);
});

for (const [type, size, mime, message] of [
  ["", 1, "image/png", /tipo de documento/], ["FAKE", 1, "image/png", /tipo de documento/],
  ["OTHER", null, "image/png", /Selecciona un archivo/], ["OTHER", 0, "image/png", /vacío/],
  ["OTHER", 5 * 1024 * 1024 + 1, "image/png", /supera/], ["OTHER", 1, "text/plain", /JPEG/],
  ["OTHER", 1, "", /JPEG/],
]) test(`general validation ${type} ${size} ${mime}`, async () => {
  let posts = 0;
  const h = start(async (url, options) => { if (options.method === "POST") posts++; return list([]); }); await h.flush();
  h.nodes.find(n => n.type === "select").props.onChange({ target: { value: type } });
  if (size !== null) inputs(h)[0].props.onChange({ target: { files: [new File([new Uint8Array(size)], "file.png", { type: mime })] } });
  submit(h); await h.flush(); assert.equal(posts, 0);
  assert.ok(h.nodes.some(n => n.props?.role === "alert" && message.test(text(n))));
});

for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) test(`general exact 5 MiB canonical payload ${mime}`, async () => {
  let posts = 0; const pending = deferred();
  const h = start(async (url, options) => {
    if (options.method !== "POST") return list([]);
    posts++; assert.equal(url, "/api/members/17/member-documents");
    assert.deepEqual([...options.body.keys()], ["type", "file"]);
    assert.equal(options.body.get("type"), "OTHER"); assert.equal(options.body.get("file").size, 5 * 1024 * 1024);
    return pending.promise;
  }); await h.flush();
  h.nodes.find(n => n.type === "select").props.onChange({ target: { value: "OTHER" } });
  inputs(h)[0].props.onChange({ target: { files: [new File([new Uint8Array(5 * 1024 * 1024)], "file", { type: mime })] } });
  assert.equal(posts, 0); submit(h); submit(h); h.render(); assert.equal(posts, 1);
  assert.equal(h.nodes.find(n => n.type === "form").props["aria-busy"], true);
  assert.equal(h.nodes.filter(n => n.type === "a").length, 0);
  pending.resolve(new Response(null, { status: 201 })); await h.flush();
  assert.equal(h.nodes.find(n => n.type === "select").props.value, "OTHER");
  submit(h); await h.flush(); assert.equal(posts, 1); assert.match(h.text, /Selecciona un archivo/);
});

test("quick actions common form synchronous selection focus lock and append-only", async () => {
  const pending = deferred(); let posts = 0;
  const h = start(async (url, options) => { if (options.method === "POST") { posts++; assert.equal(options.body.get("type"), "ID_BACK"); return pending.promise; } return list([row()]); }); await h.flush();
  let focused = 0; const dom = { value: "file.png", focus() { focused++; } }; inputs(h)[0].props.ref.current = dom;
  h.button("Incorporar nueva versión").props.onClick(); h.render();
  assert.equal(h.nodes.find(n => n.type === "select").props.value, "ID_FRONT");
  assert.match(h.text, /Se conservarán los documentos anteriores\./); assert.doesNotMatch(h.text, /reemplazar|sobrescribir/i);
  const quick = h.button("Incorporar reverso"); assert.equal(quick.props.type, "button"); quick.props.onClick();
  inputs(h)[0].props.onChange({ target: { files: [new File(["x"], "file.png", { type: "image/png" })] } });
  submit(h); quick.props.onClick(); submit(h);
  h.nodes.find(n => n.type === "select").props.onChange({ target: { value: "OTHER" } });
  inputs(h)[0].props.onChange({ target: { files: [] } }); h.render();
  assert.equal(focused, 2); assert.equal(posts, 1); assert.equal(inputs(h).length, 1);
  assert.equal(h.nodes.find(n => n.type === "select").props.value, "ID_BACK");
  assert.ok(h.nodes.filter(n => n.type === "select" || n.type === "input").every(n => n.props.disabled));
  pending.resolve(new Response(null, { status: 201 })); await h.flush(); assert.equal(dom.value, "");
});

for (const code of ["INVALID_DOCUMENT_TYPE", "DOCUMENT_EMPTY", "DOCUMENT_TOO_LARGE", "UNSUPPORTED_MIME", "INVALID_DOCUMENT_BYTES", "STORAGE_UNAVAILABLE", "PRIVATE_STORAGE_REQUIRED", "STORAGE_UPLOAD_FAILED", "MEMBER_NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "UNKNOWN"]) test(`backend rejection ${code} preserves selection`, async () => {
  let posts = 0;
  const h = start(async (url, options) => { if (options.method === "POST") { posts++; return Response.json({ error: code }, { status: 400 }); } return list([]); });
  await h.flush(); send(h); await h.flush();
  assert.ok(h.nodes.some(n => n.props?.role === "alert")); assert.doesNotMatch(h.text, /No se pudo confirmar|Documento incorporado/);
  const expected = {
    INVALID_DOCUMENT_TYPE: /tipo de documento válido/, DOCUMENT_EMPTY: /no esté vacío/,
    DOCUMENT_TOO_LARGE: /supera el máximo de 5 MiB/, UNSUPPORTED_MIME: /JPEG, PNG, WEBP o PDF/,
    INVALID_DOCUMENT_BYTES: /imagen o PDF válido/, STORAGE_UNAVAILABLE: /almacenamiento no está disponible/,
    PRIVATE_STORAGE_REQUIRED: /almacenamiento no está disponible/, STORAGE_UPLOAD_FAILED: /No se pudo guardar/,
    MEMBER_NOT_FOUND: /No se ha encontrado el socio/, UNAUTHORIZED: /sesión ha caducado/,
    FORBIDDEN: /No tienes permiso/, UNKNOWN: /No se pudo incorporar el documento\./,
  };
  assert.match(h.text, expected[code]);
  assert.equal(h.nodes.find(n => n.type === "select").props.value, "ID_FRONT");
  submit(h); await h.flush(); assert.equal(posts, 2);
});

for (const outcome of ["success", "http", "network"]) test(`unmount pending POST ${outcome} never aborts or updates state`, async () => {
  const pending = deferred(); let calls = 0;
  const h = start((url, options) => {
    calls++;
    if (options.method === "POST") { assert.equal(options.signal, undefined); return pending.promise; }
    return Promise.resolve(list([]));
  }); await h.flush(); send(h); h.unmount();
  if (outcome === "network") pending.reject(new Error("offline"));
  else pending.resolve(new Response(null, { status: outcome === "success" ? 201 : 403 }));
  await tick(); assert.equal(h.lateUpdates, 0); assert.equal(calls, 2);
});

test("history lazy, cached reopen, loading, empty, initial error retry and a11y", async () => {
  const pending = deferred(); const calls = [];
  const h = start((url) => { if (!url.includes("view=all")) return Promise.resolve(list([])); calls.push(url); return calls.length === 1 ? pending.promise : Promise.resolve(list([])); });
  await h.flush(); assert.equal(calls.length, 0);
  assert.equal(h.button("Ver histórico").props["aria-expanded"], false);
  assert.equal(h.button("Ver histórico").props["aria-controls"], history(h).props.id);
  openHistory(h); assert.equal(calls[0], "/api/members/17/member-documents?view=all&limit=20");
  assert.equal(history(h).props["aria-busy"], true); assert.equal(h.button("Cerrar histórico").props["aria-expanded"], true);
  pending.reject(new Error("offline")); await h.flush();
  assert.match(text(history(h)), /No se pudo cargar el histórico documental\./);
  assert.ok(nodes(history(h)).some(n => n.props?.role === "alert"));
  assert.match(h.text, /No hay documentos incorporados/);
  h.button("Reintentar").props.onClick(); await h.flush(); assert.match(text(history(h)), /El histórico documental está vacío\./);
  h.button("Cerrar histórico").props.onClick(); h.render(); openHistory(h); await h.flush(); assert.equal(calls.length, 2);
});

for (const currentAvailable of [true, false]) test(`history metadata, no preview or legacy, own markers ${currentAvailable}`, async () => {
  const documents = [row("ID_FRONT", 81), { ...row("OTHER", 82, "application/pdf"), isCurrent: false }];
  const h = uiHarness({ props: { ...props, initialBackUrl: "https://legacy.invalid/secret" }, fetch: async url => url.includes("view=all") ? list(documents) : currentAvailable ? list([documents[1]]) : new Response(null, { status: 500 }) });
  await h.flush(); openHistory(h); await h.flush();
  const panel = history(h), entries = nodes(panel).filter(n => n.type === "li");
  assert.equal(entries.length, 2); assert.doesNotMatch(text(panel), /compatibilidad|legacy/);
  assert.equal(nodes(panel).filter(n => n.type === "img" || n.type === "iframe").length, 0);
  assert.match(text(entries[0]), /DNI frontal.*<b>document.pdf<\/b>.*PNG.*KiB.*Incorporado:/);
  assert.match(text(entries[1]), /Otro.*PDF/);
  assert.match(text(entries[0]), /Actual · último incorporado/);
  assert.match(text(entries[1]), /Versión anterior/);
  assert.deepEqual(nodes(panel).filter(n => n.type === "a").map(n => n.props.href), documents.flatMap(d => ["inline", "attachment"].map(disposition => `/api/members/17/member-documents/${d.id}/content?disposition=${disposition}`)));
});

const historyLabels = h => nodes(history(h)).filter(n => n.type === "li").map(entry => ({
  id: Number(nodes(entry).find(n => n.type === "a").props.href.match(/documents\/(\d+)/)[1]),
  current: text(entry).includes("Actual · último incorporado"),
  previous: text(entry).includes("Versión anterior"),
}));

test("history honors newer B current marker over cached current A", async () => {
  const a = row("ID_FRONT", 1), b = row("ID_FRONT", 2);
  const h = start(async url => url.includes("view=all") ? list([b, { ...a, isCurrent: false }]) : list([a]));
  await h.flush(); openHistory(h); await h.flush();
  assert.deepEqual(historyLabels(h), [
    { id: 2, current: true, previous: false }, { id: 1, current: false, previous: true },
  ]);
  const principal = h.nodes.filter(n => n.type === "article").flatMap(nodes);
  assert.ok(principal.some(n => n.props?.href?.includes("/1/content")));
  assert.ok(!principal.some(n => n.props?.href?.includes("/2/content")));
  h.button("Actualizar documentación").props.onClick(); await h.flush();
  assert.equal(historyLabels(h)[0].current, true);
  assert.equal(historyLabels(h)[1].previous, true);
});

test("history pagination reconciles explicit newer markers without guessing a current", async () => {
  let gets = 0;
  const h = start(async url => !url.includes("view=all") ? list([]) : ++gets === 1
    ? page([row("OTHER", 9), row("ID_FRONT", 4)], "second")
    : gets === 2 ? page([row("OTHER", 7), { ...row("ID_FRONT", 3), isCurrent: false }], "third")
    : page([{ ...row("OTHER", 7), isCurrent: false }]));
  await h.flush(); openHistory(h); await h.flush();
  h.button("Cargar más").props.onClick(); await h.flush();
  assert.deepEqual(historyLabels(h), [
    { id: 9, current: false, previous: true }, { id: 4, current: true, previous: false },
    { id: 7, current: true, previous: false }, { id: 3, current: false, previous: true },
  ]);
  h.button("Cargar más").props.onClick(); await h.flush();
  assert.deepEqual(historyLabels(h), [
    { id: 9, current: false, previous: true }, { id: 4, current: true, previous: false },
    { id: 7, current: false, previous: true }, { id: 3, current: false, previous: true },
  ]);
});

for (const additional of [false, true]) test(`history newest markers survive late old snapshot ${additional}`, async () => {
  const old = deferred(); let gets = 0;
  const a = row("ID_FRONT", 1), b = row("ID_FRONT", 2);
  const h = start(async (url, options) => {
    if (options.method === "POST") return new Response(null, { status: 200 });
    if (!url.includes("view=all")) return list([a]);
    if (additional && ++gets === 1) return page([a], "old-page");
    if (!additional) gets++;
    return gets === (additional ? 2 : 1) ? old.promise : page([b, { ...a, isCurrent: false }]);
  });
  await h.flush(); openHistory(h); await h.flush();
  if (additional) { h.button("Cargar más").props.onClick(); h.render(); }
  send(h); await h.flush();
  const expected = [{ id: 2, current: true, previous: false }, { id: 1, current: false, previous: true }];
  assert.deepEqual(historyLabels(h), expected);
  old.resolve(page([a, { ...b, isCurrent: false }], "stale")); await h.flush();
  assert.deepEqual(historyLabels(h), expected);
  assert.equal(h.button("Cargar más"), undefined);
});

test("history pagination opaque cursor, lock, error retains cursor, dedup order and end", async () => {
  const cursor = "opaque+/=&? %雪"; const pending = deferred(); const calls = [];
  const h = start(url => {
    if (!url.includes("view=all")) return Promise.resolve(list([]));
    calls.push(url);
    return calls.length === 1 ? Promise.resolve(page([row("OTHER", 9), row("OTHER", 5)], cursor)) : calls.length === 2 ? pending.promise : Promise.resolve(page([row("OTHER", 5), row("OTHER", 7)]));
  }); await h.flush(); openHistory(h); await h.flush();
  const more = h.button("Cargar más"); more.props.onClick(); more.props.onClick(); h.render();
  assert.equal(calls.length, 2); assert.equal(h.button("Cargar más").props.disabled, true);
  const expected = new URLSearchParams({ view: "all", limit: "20", cursor });
  assert.equal(calls[1], `/api/members/17/member-documents?${expected}`);
  pending.reject(new Error("offline")); await h.flush();
  assert.match(text(history(h)), /No se pudieron cargar más documentos\./);
  assert.equal(nodes(history(h)).filter(n => n.type === "li").length, 2);
  h.button("Cerrar histórico").props.onClick(); h.render(); openHistory(h); await h.flush();
  assert.equal(calls.length, 2);
  assert.match(text(history(h)), /No se pudieron cargar más documentos\./);
  assert.equal(nodes(history(h)).filter(n => n.type === "li").length, 2);
  h.button("Reintentar").props.onClick(); await h.flush(); assert.equal(calls[2], calls[1]);
  assert.deepEqual(nodes(history(h)).filter(n => n.type === "a" && n.props.target).map(n => n.props.href.match(/documents\/(\d+)/)[1]), ["9", "5", "7"]);
  assert.equal(h.button("Cargar más"), undefined); assert.doesNotMatch(text(history(h)), /vacío|No se pudieron/);
  h.button("Cerrar histórico").props.onClick(); h.render(); openHistory(h); await h.flush(); assert.equal(calls.length, 3);
});

for (const additional of [false, true]) for (const outcome of ["success", "error", "abort"]) test(`history stale upload reset ${additional} ${outcome}`, async () => {
  const old = deferred(), fresh = deferred(); let gets = 0; const signals = [];
  const h = start((url, options) => {
    if (!url.includes("view=all")) return Promise.resolve(list([]));
    signals.push(options.signal); gets++;
    if (additional && gets === 1) return Promise.resolve(page([row("OTHER", 1)], "old-cursor"));
    return gets === (additional ? 2 : 1) ? old.promise : fresh.promise;
  }); await h.flush(); openHistory(h); await h.flush();
  if (additional) { h.button("Cargar más").props.onClick(); h.render(); }
  h.button("Cerrar histórico").props.onClick(); h.render(); send(h); await h.flush();
  assert.equal(gets, additional ? 3 : 2); assert.equal(signals.at(-2).aborted, true);
  assert.equal(history(h).props.hidden, true); assert.equal(nodes(history(h)).filter(n => n.type === "li").length, 0);
  openHistory(h); assert.equal(gets, additional ? 3 : 2);
  if (outcome === "success") old.resolve(page([row("OTHER", 88)], "stale"));
  else old.reject(Object.assign(new Error("old"), { name: outcome === "abort" ? "AbortError" : "Error" }));
  await h.flush(); assert.equal(history(h).props["aria-busy"], true); assert.doesNotMatch(text(history(h)), /No se pudo|No se pudieron/);
  fresh.resolve(page([row("OTHER", 99)])); await h.flush();
  assert.equal(nodes(history(h)).filter(n => n.type === "li").length, 1);
  assert.ok(nodes(history(h)).some(n => n.props?.href?.includes("/99/content")));
  assert.ok(!nodes(history(h)).some(n => n.props?.href?.includes("/88/content")));
  assert.equal(h.button("Cargar más"), undefined); assert.match(h.text, /Documento incorporado\./);
});

for (const additional of [false, true]) for (const freshFails of [false, true]) for (const outcome of ["success", "error", "abort"]) test(`history late settlement after newest result ${additional} ${freshFails} ${outcome}`, async () => {
  const old = deferred(); let gets = 0; const calls = [];
  const h = start(url => {
    if (!url.includes("view=all")) return Promise.resolve(list([]));
    calls.push(url); gets++;
    if (additional && gets === 1) return Promise.resolve(page([row("OTHER", 1)], "old-cursor"));
    if (gets === (additional ? 2 : 1)) return old.promise;
    return Promise.resolve(freshFails ? new Response(null, { status: 500 }) : page([row("OTHER", 99)], "fresh-cursor"));
  }); await h.flush(); openHistory(h); await h.flush();
  if (additional) { h.button("Cargar más").props.onClick(); h.render(); }
  send(h); await h.flush();
  h.button("Cerrar histórico").props.onClick(); h.render();
  const before = text(history(h));
  assert.equal(history(h).props["aria-busy"], false);
  if (freshFails) assert.match(before, /No se pudo cargar el histórico documental\./);
  else assert.ok(nodes(history(h)).some(n => n.props?.href?.includes("/99/content")));
  if (outcome === "success") old.resolve(page([row("OTHER", 88)], "stale-cursor"));
  else old.reject(Object.assign(new Error("old"), { name: outcome === "abort" ? "AbortError" : "Error" }));
  await h.flush();
  assert.equal(text(history(h)), before); assert.equal(history(h).props.hidden, true);
  assert.equal(history(h).props["aria-busy"], false); assert.equal(h.lateUpdates, 0);
  openHistory(h); assert.equal(gets, additional ? 3 : 2);
  h.button(freshFails ? "Reintentar" : "Cargar más").props.onClick(); await h.flush();
  assert.equal(calls.at(-1), `/api/members/17/member-documents?view=all&limit=20${freshFails ? "" : "&cursor=fresh-cursor"}`);
});

test("history refresh failure preserves upload success and resets loaded sequence", async () => {
  let gets = 0;
  const h = start(async url => !url.includes("view=all") ? list([]) : ++gets === 1 ? page([row()], "cursor") : new Response(null, { status: 500 }));
  await h.flush(); openHistory(h); await h.flush(); send(h); await h.flush();
  assert.match(h.text, /Documento incorporado\./); assert.match(text(history(h)), /No se pudo cargar el histórico documental\./);
  assert.equal(nodes(history(h)).filter(n => n.type === "li").length, 0); assert.equal(h.button("Cargar más"), undefined);
  assert.ok(h.nodes.some(n => n.props?.role === "status" && text(n) === "Documento incorporado. No se pudo actualizar el listado."));
});

for (const additional of [false, true]) for (const reject of [false, true]) test(`history member change unmount ${additional} ${reject}`, async () => {
  const pending = deferred(); let gets = 0, signal;
  const h = start((url, options) => {
    if (!url.includes("view=all")) return Promise.resolve(list([]));
    gets++; signal = options.signal;
    return additional && gets === 1 ? Promise.resolve(page([row()], "cursor")) : pending.promise;
  }); await h.flush(); openHistory(h); await h.flush();
  if (additional) h.button("Cargar más").props.onClick();
  h.render({ ...props, memberId: 18 }); await h.flush(); assert.equal(signal.aborted, true);
  assert.equal(h.button("Ver histórico").props["aria-expanded"], false);
  if (reject) pending.reject(Object.assign(new Error("late"), { name: "AbortError" })); else pending.resolve(page([row("OTHER", 88)], "old"));
  await h.flush(); assert.equal(h.lateUpdates, 0); assert.ok(!h.nodes.some(n => n.props?.href?.includes("/88/content")));
  const last = deferred(); const unmounted = start((url, options) => { signal = options.signal; return url.includes("view=all") ? last.promise : Promise.resolve(list([])); });
  await unmounted.flush(); openHistory(unmounted); unmounted.unmount(); assert.equal(signal.aborted, true);
  if (reject) last.reject(new Error("late")); else last.resolve(list([row()]));
  await tick(); assert.equal(unmounted.lateUpdates, 0);
});

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
    assert.equal(url, "/api/members/17/member-documents"); assert.equal(options.body.get("type"), side === "front" ? "ID_FRONT" : "ID_BACK");
    assert.deepEqual([...options.body.keys()], ["type", "file"]); return pending.promise;
  } return list(items); }); await h.flush();
  send(h, side); submit(h); send(h, "back");
  h.render(); assert.ok(inputs(h).every(n => n.props.disabled)); assert.equal(calls.filter(u => u.endsWith("/member-documents")).length, 1);
  items = [row(side === "front" ? "ID_FRONT" : "ID_BACK")]; pending.resolve(new Response(null, { status: 200 })); await h.flush();
  assert.match(h.text, /Documento incorporado\./); assert.equal(h.nodes.filter(n => n.type === "a").length, 2);
  assert.equal(calls.length, 3); assert.ok(calls.every(u => !/history|contracts/.test(u)));
});

for (const mode of ["rejected", "uncertain", "refreshFailed"]) test(`upload ${mode}: accurate message and zero retry`, async () => {
  let posts = 0, gets = 0;
  const h = start(async (url, options) => {
    if (options.method === "POST") { posts++; if (mode === "uncertain") throw new Error("network"); return mode === "rejected" ? Response.json({ error: "UNSUPPORTED_MIME" }, { status: 415 }) : list([]); }
    if (++gets > 1 && mode === "refreshFailed") throw new Error("refresh"); return list([]);
  }); await h.flush(); send(h); await h.flush();
  assert.match(h.text, mode === "rejected" ? /Selecciona un archivo JPEG, PNG, WEBP o PDF/ : mode === "uncertain" ? /No se pudo confirmar la incorporación. Actualiza la documentación antes de repetir./ : /Documento incorporado. No se pudo actualizar el listado./);
  assert.doesNotMatch(h.text, /No se pudo subir/); assert.equal(posts, 1); await h.flush(); assert.equal(posts, 1);
  assert.ok(h.nodes.some(n => n.props?.role === "alert"));
});

for (const oldError of [false, true]) test(`stale ${oldError ? "error" : "response"} and finally cannot clear new loading`, async () => {
  const old = deferred(), fresh = deferred(); let gets = 0; const signals = [];
  const h = start((url, options) => { if (options.method === "POST") return Promise.resolve(list([])); signals.push(options.signal); return ++gets === 1 ? Promise.resolve(list([])) : gets === 2 ? old.promise : fresh.promise; });
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(h); await tick(); h.render();
  assert.equal(signals[1].aborted, true);
  if (oldError) old.reject(new Error("old")); else old.resolve(list([row("OTHER", 88)]));
  await h.flush(); assert.match(h.text, /Cargando documentación…/); assert.doesNotMatch(h.text, /No se pudo cargar la documentación/);
  fresh.resolve(list([row("ID_FRONT", 99)])); await h.flush();
  assert.ok(h.nodes.some(n => n.props?.href?.includes("/99/content"))); assert.ok(!h.nodes.some(n => n.props?.href?.includes("/88/content")));
});

test("older success arriving after newest response is ignored", async () => {
  const old = deferred(); let gets = 0;
  const h = start((url, options) => options.method === "POST" ? Promise.resolve(list([])) : ++gets === 1 ? Promise.resolve(list([])) : gets === 2 ? old.promise : Promise.resolve(list([row("ID_BACK", 42)])));
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(h); await h.flush(); old.resolve(list([])); await h.flush();
  assert.ok(h.nodes.some(n => n.props?.href?.includes("/42/content")));
});

test("member change/unmount abort and isolate reads and pending POST callbacks", async () => {
  const pending = deferred(), upload = deferred(); const calls = [], signals = [];
  const h = start((url, options) => { calls.push(url); signals.push(options.signal); return options.method === "POST" ? upload.promise : url.includes("/18/") ? pending.promise : Promise.resolve(list([])); });
  await h.flush(); send(h); h.render({ ...props, memberId: 18 });
  upload.resolve(list([])); await h.flush(); assert.equal(calls.filter(u => u.includes("/17/member-documents")).length, 2);
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
  assert.doesNotMatch(source, /storageBucket|storageKey|sha256|signedUrl|nextCursor=|onUploaded|setFrontUrl|setBackUrl/);
});

test("confirmed upload followed by failed current must not claim old absences", async () => {
  let gets = 0;
  const h = start(async (url, options) => options.method === "POST" ? new Response(null, { status: 200 }) : ++gets === 1 ? list([]) : Response.json({ error: "failed" }, { status: 500 }));
  await h.flush(); send(h); await h.flush();
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
  await h.flush(); h.button("Actualizar documentación").props.onClick(); send(h); await h.flush();
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
  }); await h.flush(); send(h); await h.flush();
  if (mode === "uncertain") { assert.ok(inputs(h).every(n => n.props.disabled)); submit(h); await h.flush(); assert.equal(posts, 1); h.button("Actualizar documentación").props.onClick(); await h.flush(); }
  assert.ok(inputs(h).every(n => !n.props.disabled)); assert.equal(posts, 1);
  send(h, "back"); await h.flush(); assert.equal(posts, 2);
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
  const before = calls.length; send(h); await h.flush();
  assert.deepEqual(calls.slice(before), ["/api/members/17/member-documents", "/api/members/17/member-documents?view=current"]);
  assert.ok(h.button("Guardar cambios"));
});
