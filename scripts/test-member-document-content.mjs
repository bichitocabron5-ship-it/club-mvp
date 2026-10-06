// Execute production route + persisted auth with controlled DB/Storage dependencies.
// Mutations are transpiled in memory only. No live database/network is claimed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const route = "app/api/members/[id]/member-documents/[documentId]/content/route.ts";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const reader = "lib/member-document-reader.ts";
const cache = "private, no-store, max-age=0";
const bytes = Buffer.from([0, 255, 13, 10, 42, 128]);
const hash = data => createHash("sha256").update(data).digest("hex");
function harness(options = {}, mutation) {
  const calls = [], queries = [], forbidden = [];
  const row = { id: 23, memberId: 17, mimeType: "image/jpeg", byteLength: bytes.length,
    sha256: hash(bytes), storageBucket: "PRIVATE_BUCKET", storageKey: "PRIVATE_KEY",
    originalName: "PRIVATE_NAME.pdf", ...options.row };
  const deny = name => { forbidden.push(name); throw new Error(`PRIVATE_${name}`); };
  const guard = (object, prefix) => new Proxy(object, { get: (target, key) => key in target ? target[key] : () => deny(`${prefix}.${String(key)}`) });
  const prisma = guard({
    appUser: guard({ findUnique: async () => {
      calls.push("auth"); if (options.authError) throw new Error("PRIVATE_PRISMA");
      return options.missingUser ? null : { id: 7, active: options.active ?? true, role: options.role ?? "STAFF" };
    } }, "appUser"),
    memberDocument: guard({ findFirst: async query => {
      calls.push("document"); queries.push(query);
      if (options.dbError) throw new Error("PRIVATE_PRISMA");
      if (options.missing || !Object.entries(query.where).every(([key, value]) => row[key] === value)) return null;
      return Object.fromEntries(Object.keys(query.select).map(key => [key, row[key]]));
    } }, "memberDocument"),
    member: guard({}, "member"), auditLog: guard({}, "auditLog"),
  }, "prisma");
  const mocks = {
    "server-only": {}, "@/lib/prisma": { prisma }, "@/lib/auth": { authConfig: {} },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "7", role: "ADMIN" } } },
    "@/lib/storage": { isStorageUrlsDisabled: () => !!options.disabled },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => {
      calls.push("storage"); if (options.unconfigured) throw new Error("PRIVATE_CONFIG");
      return { storage: { from: bucket => {
        assert.equal(bucket, row.storageBucket);
        return guard({ download: async key => {
          assert.equal(key, row.storageKey);
          if (options.storageThrow) throw new Error("PRIVATE_SDK");
          return { error: options.storageError ? { message: "PRIVATE_SDK" } : null,
            data: options.absent ? null : { type: options.blobType ?? "text/html", arrayBuffer: async () => {
              if (options.readError) throw new Error("PRIVATE_READ");
              return Uint8Array.from(options.bytes ?? bytes).buffer;
            } } };
        } }, "storage");
      } } };
    } },
  };
  function load(path) {
    let source = read(path);
    if (path === (mutation?.path ?? route) && mutation) source = source.replace(mutation.from, mutation.to);
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, Buffer, Response, URL, require: name => mocks[name] ?? (name === "@/lib/member-document-reader" ? load(reader) : name === "@/lib/auth-server" ? load("lib/auth-server.ts") : name === "node:crypto" ? require(name) : deny(name)) });
    return exports;
  }
  const handlers = load(route);
  return { calls, queries, forbidden, handlers,
    get: (query = "", id = "17", documentId = "23", method = "GET") => {
      const methods = require("next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js").autoImplementMethods(handlers);
      return methods[method](new Request(`http://local/content?${query}`, { method }), { params: Promise.resolve({ id, documentId }) });
    } };
}
async function error(h, status, code, query = "", id = "17", documentId = "23", method = "GET") {
  const res = await h.get(query, id, documentId, method);
  assert.equal(res.status, status); assert.equal(res.headers.get("cache-control"), cache);
  assert.equal(res.headers.get("location"), null);
  assert.deepEqual(await res.json(), { error: code });
  assert.deepEqual(h.forbidden, []);
}
async function content(h, query = "", mime = "image/jpeg", ext = "jpg", method = "GET") {
  const res = await h.get(query, "17", "23", method);
  assert.equal(res.status, 200); assert.equal(res.headers.get("location"), null);
  for (const [key, value] of Object.entries({ "cache-control": cache, "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox", "content-type": mime, "content-length": String(bytes.length),
    "content-disposition": `${query === "disposition=attachment" ? "attachment" : "inline"}; filename="document-23.${ext}"` })) assert.equal(res.headers.get(key), value);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  assert.doesNotMatch(JSON.stringify([...res.headers]), /PRIVATE|storageKey|sha256|originalName/);
  assert.deepEqual(h.forbidden, []);
  for (const query of h.queries) {
    assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { id: 23, memberId: 17 });
    assert.deepEqual(Object.keys(query.select).sort(), ["id", "mimeType", "byteLength", "sha256", "storageBucket", "storageKey"].sort());
  }
}
test("auth precedes validation, DB and Storage; persisted roles apply each call", async () => {
  for (const [options, status] of [[{ noSession: true }, 401], [{ missingUser: true }, 401], [{ active: false }, 401], [{ role: "MEMBER" }, 403]]) {
    const h = harness(options); await error(h, status, status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", "bad=1", "0");
    assert.equal(h.queries.length, 0); assert.ok(!h.calls.includes("storage"));
  }
  for (const role of ["STAFF", "ADMIN"]) await content(harness({ role }));
  const options = { role: "STAFF" }, h = harness(options); await content(h);
  options.role = "MEMBER"; const before = h.calls.length;
  await error(h, 403, "FORBIDDEN"); assert.deepEqual(h.calls.slice(before), ["auth"]);
});
test("canonical positive Int IDs, including overflow and boundary", async () => {
  for (const value of ["", "0", "-1", "+1", "01", "1.0", "1e2", " 17", "17 ", "17\n", "2147483648", "9007199254740992", "abc"]) {
    for (const args of [[value, "23"], ["17", value]]) {
      const h = harness(); await error(h, 400, "INVALID_DOCUMENT_ID", "", ...args); assert.deepEqual(h.calls, ["auth"]);
    }
  }
  await error(harness(), 404, "DOCUMENT_NOT_FOUND", "", "2147483647", "2147483647");
});
async function ownership(mutation) {
  for (const [options, id] of [[{}, "18"], [{ missing: true }, "17"]]) {
    const h = harness(options, mutation); await error(h, 404, "DOCUMENT_NOT_FOUND", "", id);
    assert.deepEqual(h.calls, ["auth", "document"]);
  }
}
test("ownership and absence give identical 404 with zero Storage; no legacy fallback", () => ownership());
test("strict disposition query and forbidden reference inputs", async () => {
  for (const query of ["", "disposition=inline", "disposition=attachment"]) await content(harness(), query);
  for (const query of ["disposition=", "disposition=INLINE", "disposition=other", "disposition=inline&disposition=inline",
    ...["bucket", "key", "filename", "MIME", "hash", "URL", "memberId", "storageKey"].map(key => `${key}=x`)]) {
    const h = harness(); await error(h, 400, "INVALID_DOCUMENT_QUERY", query); assert.deepEqual(h.calls, ["auth"]);
  }
});
test("all writer MIME types, exact bytes, minimal projection, no mutations or redirects", async () => {
  for (const [mime, ext] of [["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["application/pdf", "pdf"]]) {
    const h = harness({ row: { mimeType: mime } }); await content(h, "", mime, ext);
    assert.deepEqual(h.calls, ["auth", "document", "storage"]);
  }
  // No type/current filter: historical DNI IDs are addressed exactly like any row.
  for (const type of ["ID_FRONT", "ID_BACK"]) await content(harness({ row: { type } }));
});
async function unavailable(options, mutation) { await error(harness(options, mutation), 503, "DOCUMENT_UNAVAILABLE"); }
test("integrity and all controlled Storage failures return no content", async () => {
  for (const options of [{ row: { byteLength: 999 } }, { row: { sha256: hash(Buffer.from("abcdef")) } },
    { row: { mimeType: "text/html" } }, { row: { mimeType: "toString" } },
    { bytes: Buffer.alloc(0), row: { byteLength: 0, sha256: hash(Buffer.alloc(0)) } },
    { disabled: true }, { unconfigured: true }, { storageError: true }, { storageThrow: true }, { absent: true }, { readError: true }]) await unavailable(options);
});
test("auth/DB exceptions remain generic 500", async () => {
  for (const options of [{ authError: true }, { dbError: true }]) await error(harness(options), 500, "MEMBER_DOCUMENT_CONTENT_FAILED");
});
test("Next automatic HEAD invokes GET with full auth, ownership and integrity", async () => {
  const h = harness(); assert.equal(h.handlers.HEAD, undefined); await content(h, "", "image/jpeg", "jpg", "HEAD");
  for (const [options, status, code] of [[{ noSession: true }, 401, "UNAUTHORIZED"], [{ role: "MEMBER" }, 403, "FORBIDDEN"],
    [{ missing: true }, 404, "DOCUMENT_NOT_FOUND"], [{ row: { sha256: "bad" } }, 503, "DOCUMENT_UNAVAILABLE"]]) {
    const denied = harness(options); await error(denied, status, code, "", "17", "23", "HEAD");
    if (status !== 503) assert.ok(!denied.calls.includes("storage"));
  }
});
test("Next sendResponse suppresses HEAD bodies and exposes document headers only after authorization", async () => {
  const { sendResponse } = require("next/dist/server/send-response.js");
  for (const [options, id, status] of [[{}, "17", 200], [{ noSession: true }, "17", 401],
    [{ role: "MEMBER" }, "17", 403], [{}, "18", 404], [{ missing: true }, "17", 404],
    [{ row: { sha256: "bad" } }, "17", 503]]) {
    const h = harness(options);
    const response = await h.get("", id, "23", "HEAD");
    const headers = new Headers(); let ended = 0;
    // Real Next sender; the sink rejects writes and even reading the body is
    // forbidden. This closes the gap between handler Response and HTTP output.
    const body = response.body;
    body.getReader = () => assert.fail("HEAD body must not be read");
    body.pipeTo = () => assert.fail("HEAD body must not be piped");
    const sink = {
      getHeader: key => headers.get(key) ?? undefined,
      appendHeader: (key, value) => headers.append(key, value),
      originalResponse: {
        write: () => assert.fail("HEAD body must not be written"),
        end: value => { assert.equal(value, undefined); ended++; },
      },
    };
    await sendResponse({ method: "HEAD" }, sink, response);
    assert.equal(ended, 1); assert.equal(sink.statusCode, status);
    assert.equal(headers.get("cache-control"), cache);
    assert.equal(headers.get("content-length"), status === 200 ? String(bytes.length) : null);
    assert.equal(headers.get("content-type"), status === 200 ? "image/jpeg" : "application/json");
    assert.equal(headers.get("content-disposition"), status === 200 ? 'inline; filename="document-23.jpg"' : null);
    assert.deepEqual(h.forbidden, []);
    if (status === 401 || status === 403) assert.equal(h.queries.length, 0);
    if ([401, 403, 404].includes(status)) assert.ok(!h.calls.includes("storage"));
  }
});
const mutations = [
  { name: "weaken staff auth to any active user", from: 'import { requireStaffOrAdmin }', to: 'import { requireAuth as requireStaffOrAdmin }', check: async m => {
    const h = harness({ role: "MEMBER" }, m);
    await error(h, 403, "FORBIDDEN"); assert.deepEqual(h.calls, ["auth"]);
  } },
  { name: "remove ownership", from: 'id: Number(documentId), memberId: Number(id)', to: 'id: Number(documentId)', check: ownership },
  { name: "Storage before ownership", from: 'const document = await prisma', to: 'await readVerifiedMemberDocument({}); const document = await prisma', check: ownership },
  { path: reader, name: "remove hash", from: 'createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== document.sha256', to: 'false', check: m => unavailable({ row: { sha256: "bad" } }, m) },
  { path: reader, name: "remove length", from: 'bytes.byteLength !== document.byteLength', to: 'false', check: m => unavailable({ row: { byteLength: 999 } }, m) },
  { path: reader, name: "trust Blob.type", from: 'const mimeType = document.mimeType;', to: 'const mimeType = download.data.type;', check: m => content(harness({}, m)) },
  { name: "originalName filename", from: 'document-${document.id}.${extension}', to: '${document.originalName}', check: m => content(harness({}, m)) },
  { path: reader, name: "signed URL", from: 'const bytes = await download.data.arrayBuffer();', to: 'await getSupabaseAdmin().storage.from(document.storageBucket).createSignedUrl(document.storageKey, 60); const bytes = await download.data.arrayBuffer();', check: m => content(harness({}, m)) },
  { name: "redirect", from: 'return new Response(bytes,', to: 'return Response.redirect("https://storage.invalid/private"); return new Response(bytes,', check: m => content(harness({}, m)) },
  { name: "legacy fallback", from: 'if (!document) return failure', to: 'if (!document) await prisma.member.findUnique({ where: { id: Number(id) }, select: { dniFrontUrl: true } }); if (!document) return failure', check: ownership },
  { name: "storageKey error leak", from: 'const { bytes, mimeType: mime, byteLength, extension } = await readVerifiedMemberDocument(document);', to: 'return failure(document.storageKey, 503);', check: m => unavailable({ absent: true }, m) },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, async () => {
  assert.ok(read(mutation.path ?? route).includes(mutation.from), `Missing mutation target: ${mutation.name}`);
  await assert.rejects(() => mutation.check(mutation), { name: "AssertionError" });
});
