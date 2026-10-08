// Real routes, resolver, persisted auth, parser and writer. In-memory DB/Storage;
// no claim of live PostgreSQL, Storage or browser verification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const require = createRequire(import.meta.url);
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const plain = x => JSON.parse(JSON.stringify(x));
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
const pdf = await PDFDocument.create(); pdf.addPage();
const pdfBytes = Buffer.from(await pdf.save());
const url = side => `/api/members/17/documents?side=${side}`;
function form(side = "front", bytes = png, mime = "image/png") {
  const f = new FormData(); f.set("side", side); f.set("image", new File([bytes], "id.png", { type: mime })); return f;
}
function harness(options = {}, mutation) {
  const member = { id: 17, dniFrontUrl: "club-uploads/members/17/dni-front-123.png",
    dniBackUrl: "member-documents/members/17/dni-back.pdf", photoUrl: null, ...options.member };
  const rows = [], objects = new Map(), audits = [], removals = [], queries = [], uploads = [];
  let sequence = 0;
  const add = (side, id, createdAt, bytes = png, memberId = 17, mimeType = "image/png") => {
    sequence = Math.max(sequence, id);
    const row = { id, memberId, type: side === "front" ? "ID_FRONT" : "ID_BACK",
      createdAt: new Date(createdAt), storageBucket: "member-documents", storageKey: `fixture/${id}`,
      byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType };
    rows.push(row); objects.set(`${row.storageBucket}/${row.storageKey}`, new Blob([bytes], { type: mimeType })); return row;
  };
  objects.set(member.dniFrontUrl, new Blob([png], { type: "image/png" }));
  objects.set(member.dniBackUrl, new Blob([pdfBytes], { type: "application/pdf" }));
  const db = {
    appUser: { findUnique: async () => options.missingUser ? null : { id: 7, active: options.active ?? true, role: options.role ?? "STAFF" } },
    member: {
      findUnique: async ({ where }) => options.missingMember ? null : where.id === 17 ? member :
        options.secondMember && where.id === 18 ? { id: 18, dniFrontUrl: null, dniBackUrl: null } : null,
      update: async () => { throw new Error("Legacy dual-write forbidden"); },
    },
    sale: { findMany: async () => [] },
    memberDocument: { findFirst: async query => {
      queries.push(plain(query));
      assert.deepEqual(plain(query.orderBy), [{ createdAt: "desc" }, { id: "desc" }]);
      const row = rows.filter(r => (query.where.memberId === undefined || r.memberId === query.where.memberId) &&
        (query.where.type === undefined || r.type === query.where.type))
        .sort((a, b) => {
          for (const clause of query.orderBy) {
            const [field, direction] = Object.entries(clause)[0];
            const delta = a[field] - b[field];
            if (delta) return direction === "desc" ? -delta : delta;
          }
          return 0;
        })[0];
      return row ? Object.fromEntries(Object.keys(query.select).map(k => [k, row[k]])) : null;
    } },
    async $transaction(fn) {
      const pending = [], pendingAudit = [];
      const result = await fn({
        memberDocument: { create: async ({ data, select }) => {
          const row = { ...data, id: ++sequence, createdAt: new Date("2026-10-02T12:00:00Z") };
          pending.push(row);
          // Yield to simulate overlapping same-side transactions with tied timestamps.
          await Promise.resolve();
          return Object.fromEntries(Object.keys(select).map(k => [k, row[k]]));
        } },
        auditLog: { create: async ({ data }) => { if (options.auditFail) throw new Error(); pendingAudit.push(data); } },
      });
      rows.push(...pending); audits.push(...pendingAudit); return result;
    },
  };
  const storage = {
    getBucket: async () => ({ data: { public: false } }),
    from: bucket => ({
      createSignedUrl: async (key, ttl) => {
        assert.equal(ttl, 900);
        if (options.signError) return { data: null, error: options.signError };
        return { data: { signedUrl: `https://project.supabase.co/storage/v1/object/sign/${bucket}/${key}?token=temporary` } };
      },
      upload: async (key, bytes, settings) => {
        assert.equal(settings.upsert, false); assert.equal(objects.has(`${bucket}/${key}`), false);
        uploads.push({ bucket, key }); objects.set(`${bucket}/${key}`, new Blob([bytes], { type: settings.contentType }));
        return { data: { path: key } };
      },
      remove: async keys => { removals.push(...keys); keys.forEach(k => objects.delete(`${bucket}/${k}`)); return {}; },
      download: async key => ({ data: objects.get(`${bucket}/${key}`), error: options.downloadFail }),
    }),
  };
  const mocks = {
    "server-only": {}, "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma: db }, "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage }) },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "7", role: "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
  };
  const cache = {};
  function load(path) {
    if (cache[path]) return cache[path];
    const exports = {}; cache[path] = exports;
    vm.runInNewContext(ts.transpileModule(mutation?.path === path ? read(path).replace(mutation.from, mutation.to) : read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
      { exports, Buffer, File, FormData, Response, Request, URL, Uint8Array,
        process: { env: { STORAGE_BUCKET: "custom-uploads", SUPABASE_URL: "https://project.supabase.co" } },
        console: { error() {}, info() {}, warn() {} },
        require: name => mocks[name] ?? (name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name)),
      });
    return exports;
  }
  const dni = load("app/api/members/[id]/dni/route.ts");
  const documents = load("app/api/members/[id]/documents/route.ts");
  const context = id => ({ params: Promise.resolve({ id }) });
  return { member, rows, objects, audits, removals, queries, uploads, add,
    resolver: load("lib/member-dni.ts"),
    canonical: body => load("app/api/members/[id]/member-documents/route.ts").POST(new Request("http://local/member-documents", { method: "POST", body }), context("17")),
    post: (body = form(), id = "17", headers) => dni.POST(new Request("http://local/dni", { method: "POST", body, headers }), context(id)),
    get: (side = "front", id = "17", extra = "") => documents.GET(new Request(`http://local/documents?side=${side}${extra}`), context(id)),
    retired: () => documents.POST(),
    history: () => load("app/api/members/[id]/history/route.ts").GET(new Request("http://local/history"), context("17")),
  };
}

for (const side of ["front", "back"]) {
  test(`legacy ${side}: fallback and authenticated bytes; PDF remains readable`, async () => {
    const h = harness();
    assert.equal((await h.resolver.resolveMemberDni(17, side, h.member[side === "front" ? "dniFrontUrl" : "dniBackUrl"])).source, "legacy");
    const response = await h.get(side);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), side === "front" ? "image/png" : "application/pdf");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), side === "front" ? png : pdfBytes);
    assert.equal(h.rows.length, 0);
  });
  test(`new ${side}: append-only upload, legacy unchanged, one audit per fact and minimal DTO`, async () => {
    const h = harness(); const before = plain(h.member);
    h.add(side, 1, "2026-10-01"); const previous = plain(h.rows[0]);
    const response = await h.post(form(side)); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { [side === "front" ? "dniFrontUrl" : "dniBackUrl"]: `${url(side)}&revision=2` });
    assert.equal(h.rows.length, 2); assert.deepEqual(plain(h.rows[0]), previous);
    assert.deepEqual(plain(h.member), before); assert.deepEqual(h.removals, []);
    assert.ok(h.objects.has(before.dniFrontUrl)); assert.ok(h.objects.has(before.dniBackUrl));
    for (const row of h.rows) assert.deepEqual(Buffer.from(await h.objects.get(`${row.storageBucket}/${row.storageKey}`).arrayBuffer()), png);
    assert.equal(h.audits.length, 1); assert.equal(h.audits[0].action, "MEMBER_DOCUMENT_CREATED");
    assert.equal(h.rows[1].type, side === "front" ? "ID_FRONT" : "ID_BACK");
    const body = await (await h.history()).json();
    assert.equal(body.member.hasDniFront, true); assert.equal(body.member.hasDniBack, true);
    assert.doesNotMatch(JSON.stringify(body), /storageBucket|storageKey|sha256|fixture|club-uploads|member-documents/);
  });
  test(`concurrent ${side}: tied creation timestamps preserve both and resolve greatest ID`, async () => {
    const h = harness(); const results = await Promise.all([h.post(form(side)), h.post(form(side))]);
    assert.ok(results.every(r => r.status === 200)); assert.equal(h.rows.length, 2);
    assert.equal(new Set(h.rows.map(r => r.id)).size, 2); assert.equal(new Set(h.rows.map(r => r.storageKey)).size, 2);
    assert.equal(h.rows[0].createdAt.getTime(), h.rows[1].createdAt.getTime());
    const actual = await h.resolver.resolveMemberDni(17, side, h.member.dniFrontUrl);
    assert.equal(actual.storageKey, h.rows.find(r => r.id === 2).storageKey);
    assert.equal(h.audits.length, 2); assert.deepEqual(h.removals, []);
  });
}
test("new wins over legacy; timestamp then ID, scoped member and side", async () => {
  const h = harness();
  h.add("front", 100, "2026-09-01");
  h.add("front", 2, "2026-10-01");
  const winner = h.add("front", 3, "2026-10-01");
  h.add("front", 999, "2027-01-01", png, 18);
  h.add("back", 1000, "2027-01-01");
  for (let i = 0; i < 2; i++) {
    h.rows.reverse();
    const actual = await h.resolver.resolveMemberDni(17, "front", h.member.dniFrontUrl);
    assert.equal(actual.source, "new"); assert.equal(actual.storageKey, winner.storageKey);
  }
});
test("incident 358: persisted legacy references resolve exactly despite a different configured bucket", () => {
  const { parseLegacyDniRef: parse } = harness().resolver;
  for (const [side, timestamp] of [["front", "1787249029007"], ["back", "1787249046207"]]) {
    const path = `members/358/dni-${side}-${timestamp}.jpg`;
    assert.deepEqual(plain(parse(`club-uploads/${path}`, 358, side)), { bucket: "club-uploads", path });
    assert.equal(parse(`club-uploads/${path}`, 359, side), null);
    assert.equal(parse(`club-uploads/${path}`, 358, side === "front" ? "back" : "front"), null);
  }
});

test("storage quota rejection reproduces legacy unavailable and persisted photograph resolving to null", async () => {
  const error = { name: "StorageApiError", status: 402, statusCode: "402",
    message: "exceed_storage_size_quota" };
  const photoUrl = "club-uploads/members/17/profile-1787249068296.jpg";
  const h = harness({ member: { photoUrl }, downloadFail: error, signError: error });
  const history = await (await h.history()).json();
  assert.equal(history.member.photoUrl, null, "characterizes current response on failed signing, not absent DB data");
  assert.equal(h.member.photoUrl, photoUrl);
  for (const side of ["front", "back"]) {
    assert.equal(history.member[side === "front" ? "hasDniFront" : "hasDniBack"], true);
    const response = await h.get(side);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "DOCUMENT_UNAVAILABLE" });
  }
  assert.equal(h.uploads.length + h.removals.length + h.audits.length, 0);
});

test("legacy known formats: both buckets, bare paths, public/signed URLs and configured bucket", () => {
  const { parseLegacyDniRef: parse } = harness().resolver;
  for (const [bucket, path] of [
    ["club-uploads", "members/17/dni-front-123.jpg"],
    ["custom-uploads", "members/17/dni-front-456.webp"],
    ["member-documents", "members/17/dni-front.pdf"],
    ["member-documents", "members/17/dni-front.png"],
  ]) {
    for (const ref of [`${bucket}/${path}`, `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
      `https://project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=expired`,
      `/storage/v1/object/public/${bucket}/${path}`]) {
      assert.deepEqual(plain(parse(ref, 17, "front")), { bucket, path });
    }
  }
  assert.equal(parse("members/17/dni-front.pdf", 17, "front").bucket, "member-documents");
  assert.equal(parse("members/17/dni-front-123.png", 17, "front").bucket, "custom-uploads");
});
test("cross-member, cross-side, arbitrary bucket/object and untrusted URL fail closed", async () => {
  for (const ref of ["club-uploads/members/18/dni-front-123.png", "member-documents/members/18/dni-front.pdf",
    "members/18/dni-front.pdf", "member-documents/members/17/dni-back.pdf", "other/members/17/dni-front-123.png",
    "club-uploads/members/17/profile-123.png", "member-documents/member-document-objects/other",
    "https://evil.invalid/storage/v1/object/public/member-documents/members/17/dni-front.pdf",
    "member-documents/members/17/dni-front.pdf/../secret", "member-documents/members/17/dni-front%2epdf"]) {
    const h = harness({ member: { dniFrontUrl: ref } });
    assert.equal((await h.get()).status, 404, ref);
    assert.equal((await (await h.history()).json()).member.hasDniFront, false);
  }
});
test("new content private, nosniff, confirmed MIME, safe filename; no internal metadata in HTTP", async () => {
  const h = harness(); h.add("front", 1, "2026-10-01", pdfBytes, 17, "application/pdf");
  const response = await h.get("front", "17", "&memberId=18&path=secret&revision=999");
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="dni-front.pdf"');
  assert.doesNotMatch(JSON.stringify([...response.headers]), /storageBucket|storageKey|sha256|fixture/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdfBytes);
});
test("corrupt or unavailable canonical object never falls back to legacy", async () => {
  for (const failure of ["missing", "hash", "size", "mime", "storage"]) {
    const h = harness({ downloadFail: failure === "storage" }); const row = h.add("front", 1, "2026-10-01");
    if (failure === "missing") h.objects.delete(`${row.storageBucket}/${row.storageKey}`);
    if (failure === "hash") row.sha256 = "0".repeat(64);
    if (failure === "size") row.byteLength++;
    if (failure === "mime") row.mimeType = "text/html";
    assert.equal((await h.get()).status, 503);
  }
});
test("persisted role/active authorization for read, write and retired endpoint", async () => {
  for (const [options, status] of [[{ noSession: true }, 401], [{ missingUser: true }, 401], [{ active: false }, 401], [{ role: "MEMBER" }, 403], [{ role: "STAFF" }, 200], [{ role: "ADMIN" }, 200]]) {
    const h = harness(options);
    assert.equal((await h.get()).status, status); assert.equal((await h.post()).status, status);
    assert.equal((await h.retired()).status, status === 200 ? 410 : status);
    if (status !== 200) { assert.equal(h.rows.length, 0); assert.equal(h.queries.length, 0); }
  }
});
test("retired writer cannot upload, mutate or audit", async () => {
  const h = harness(); assert.equal((await h.retired()).status, 410);
  assert.equal(h.uploads.length, 0); assert.equal(h.rows.length, 0); assert.equal(h.audits.length, 0);
});
test("DNI adapter retains bounds, strict form, real byte validation and generic errors", async () => {
  const h = harness();
  for (const id of ["0", "017", "1e2", "2147483648", "abc"]) assert.equal((await h.post(form(), id)).status, 400);
  assert.equal((await h.post(form(), "18")).status, 404);
  for (const field of ["side", "image", "storageKey", "createdByUserId"]) {
    const f = form(); f.append(field, "forged"); assert.equal((await h.post(f)).status, 400);
  }
  assert.equal((await h.post(form("wrong"))).status, 400);
  assert.equal((await h.post(form("front", Buffer.from("<html/>")))).status, 400);
  assert.equal((await h.post(form("front", png, "image/jpeg"))).status, 400);
  assert.equal((await h.post(form("front", pdfBytes, "application/pdf"))).status, 415);
  assert.equal((await h.post(form(), "17", { "content-length": "99999999" })).status, 413);
  assert.equal((await h.post(Buffer.alloc(6 * 1024 * 1024), "17", { "content-type": "multipart/form-data; boundary=x" })).status, 413);
  assert.equal(h.rows.length, 0);
  const failed = harness({ auditFail: true });
  assert.equal((await failed.post()).status, 500); assert.equal(failed.rows.length, 0);
  assert.ok(failed.objects.has(failed.member.dniFrontUrl)); assert.ok(failed.objects.has(failed.member.dniBackUrl));
});

test("existing member B cannot retrieve A evidence through documentId, revision, key or side", async () => {
  const h = harness({ secondMember: true });
  h.add("front", 1, "2026-10-01", pdfBytes, 17, "application/pdf");
  const response = await h.get("front", "18", "&documentId=1&revision=1&memberId=17&storageKey=fixture/1&side=back");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "DOCUMENT_NOT_FOUND" });
  assert.equal((await h.get("front", "17")).status, 200);
});

test("legacy attack matrix: encoding, traversal, deceptive origins and query isolation", () => {
  const { parseLegacyDniRef: parse } = harness().resolver;
  const base = "https://project.supabase.co/storage/v1/object/";
  for (const ref of [
    base + "public/member-documents/members/17/../18/dni-front.pdf",
    base + "public/member-documents/members/17/%2e%2e/18/dni-front.pdf",
    base + "public/member-documents/members/17/%252e%252e/18/dni-front.pdf",
    base + "public/member-documents/members%2f18/dni-front.pdf",
    base + "public/member-documents/members/17/dni-%62ack.pdf",
    base + "sign/member-documents/members/18/dni-front.pdf?token=valid&memberId=17",
    base + "public/other/members/17/dni-front.pdf",
    "https://project.supabase.co.evil.invalid/storage/v1/object/public/member-documents/members/17/dni-front.pdf",
    "https://project.supabase.co@evil.invalid/storage/v1/object/public/member-documents/members/17/dni-front.pdf",
    "//project.supabase.co/storage/v1/object/public/member-documents/members/17/dni-front.pdf",
    "/member-documents/members/17/dni-front.pdf",
    "member-documents/members/17/dni-front.pdf?path=members/18/dni-front.pdf",
    "member-documents/members/17/dni-front%252epdf",
  ]) assert.equal(parse(ref, 17, "front"), null, ref);
  assert.deepEqual(plain(parse(base + "sign/member-documents/members/17/dni-front.pdf?token=expired&path=members/18/dni-back.pdf", 17, "front")),
    { bucket: "member-documents", path: "members/17/dni-front.pdf" });
});

test("history preserves existing photograph with temporary signed URL independently of DNI", async () => {
  const h = harness({ member: { photoUrl: "club-uploads/members/17/profile-123.png" } });
  const payload = await (await h.history()).json();
  assert.equal(payload.member.photoUrl, "https://project.supabase.co/storage/v1/object/sign/club-uploads/members/17/profile-123.png?token=temporary");
  assert.equal(h.rows.length, 0);
  assert.equal(h.member.photoUrl, "club-uploads/members/17/profile-123.png");
});

test("real card: canonical current after DNI upload replaces visible legacy", async () => {
  const { uiHarness } = await import("./fixtures/member-document-ui-harness.mjs");
  const h = harness(); let refreshes = 0, fail = false;
  const history = await (await h.history()).json();
  const ui = uiHarness({ props: { memberId: 17, initialFrontUrl: history.member.hasDniFront ? url("front") : null,
    initialBackUrl: history.member.hasDniBack ? url("back") : null, canUpload: true }, fetch: async (path, options) => {
    if (options.method === "POST") {
      assert.equal(path, "/api/members/17/member-documents");
      return fail ? Response.json({ error: "UNSUPPORTED_MIME" }, { status: 415 }) : h.canonical(options.body);
    }
    assert.equal(path, "/api/members/17/member-documents?view=current"); refreshes++;
    const items = ["ID_FRONT", "ID_BACK"].flatMap(type => {
      const row = h.rows.filter(r => r.type === type).sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)[0];
      return row ? [{ id: row.id, type, originalName: row.originalName, mimeType: row.mimeType,
        byteLength: row.byteLength, createdAt: row.createdAt.toISOString(), isCurrent: true }] : [];
    });
    return Response.json({ items, nextCursor: null });
  } });
  await ui.flush(); assert.match(ui.text, /DNI anterior · compatibilidad/);
  assert.equal(ui.nodes.filter(n => n.type === "img").length, 0);
  async function upload(side) {
    const slot = ui.nodes.filter(n => n.type === "article")[side === "front" ? 0 : 1];
    const { nodes } = await import("./fixtures/member-document-ui-harness.mjs");
    nodes(slot).find(n => n.type === "button").props.onClick();
    ui.nodes.find(n => n.type === "input").props.onChange({
      target: { files: [new File([png], "id.png", { type: "image/png" })], value: "" },
    });
    ui.nodes.find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 5)); await ui.flush();
      if (ui.nodes.filter(n => n.type === "input").every(n => !n.props.disabled)) return;
    }
    assert.fail("Upload did not settle");
  }
  await upload("front"); await upload("back"); await upload("front");
  assert.equal(h.rows.length, 3); assert.equal(refreshes, 4);
  assert.match(ui.text, /DNI: ambas caras disponibles/); assert.doesNotMatch(ui.text, /compatibilidad/);
  assert.deepEqual(ui.nodes.filter(n => n.type === "img").map(n => n.props.src),
    [3, 2].map(id => `/api/members/17/member-documents/${id}/content?disposition=inline`));
  fail = true; await upload("front"); assert.equal(refreshes, 4); assert.equal(h.rows.length, 3);
  assert.match(ui.text, /Selecciona un archivo JPEG/);
  assert.equal(h.member.dniFrontUrl, "club-uploads/members/17/dni-front-123.png");
  assert.equal(h.member.dniBackUrl, "member-documents/members/17/dni-back.pdf");
});

const readerPath = "lib/member-document-reader.ts";
test("canonical empty DNI with matching length/hash rejects without legacy fallback", async () => {
  const mutation = { path: readerPath, from: "bytes.byteLength === 0", to: "false" };
  assert.ok(read(readerPath).includes(mutation.from));
  async function check(m) {
    for (const side of ["front", "back"]) {
      const h = harness({}, m);
      h.add(side, 1, "2026-10-01", Buffer.alloc(0));
      const response = await h.get(side);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "DOCUMENT_UNAVAILABLE" });
    }
  }
  await check();
  await assert.rejects(() => check(mutation), { name: "AssertionError" });
});
for (const mutation of [
  { path: readerPath, from: 'createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== document.sha256', to: 'false' },
  { path: "app/api/members/[id]/documents/route.ts", from: 'const verified = await readVerifiedMemberDocument(document);',
    to: 'const verified = await readVerifiedMemberDocument(document).catch(async () => { const data = await getSupabaseAdmin().storage.from("club-uploads").download("members/17/dni-front-123.png"); return { bytes: await data.data.arrayBuffer(), mimeType: "image/png", extension: "png" }; });' },
]) test(`sensitivity: DNI canonical corruption ${mutation.path}`, async () => {
  assert.ok(read(mutation.path).includes(mutation.from));
  async function check(m) {
    const h = harness({}, m); h.add("front", 1, "2026-10-01").sha256 = "bad";
    assert.equal((await h.get()).status, 503);
  }
  await check();
  await assert.rejects(() => check(mutation), { name: "AssertionError" });
});
