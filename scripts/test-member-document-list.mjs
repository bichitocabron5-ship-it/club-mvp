// Production GET, list helper and persisted auth; controlled Prisma semantics.
// No live PostgreSQL, query-plan or concurrent transaction verification claimed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const helper = "lib/member-document-list.ts";
const route = "app/api/members/[id]/member-documents/route.ts";
const types = ["ID_FRONT", "ID_BACK", "AUTHORIZATION", "PROOF", "ANNEX", "OTHER"];
const fields = ["id", "type", "originalName", "mimeType", "byteLength", "createdAt"];
const cacheControl = "private, no-store, max-age=0";
const testSecret = "test-only-member-document-cursor-secret";
const signPayload = payload => `${payload}.${createHmac("sha256", testSecret).update("member-document-list:v1:").update(payload).digest("hex")}`;
const encode = value => signPayload(Buffer.from(JSON.stringify(value)).toString("base64url"));
function row(id, type = "OTHER", createdAt = "2026-10-02T12:00:00.000Z", memberId = 17) {
  return { id, type, createdAt: new Date(createdAt), memberId, originalName: `document-${id}.pdf`,
    mimeType: "application/pdf", byteLength: 123, storageBucket: "PRIVATE_BUCKET",
    storageKey: `PRIVATE_KEY/${id}`, sha256: "PRIVATE_HASH", createdByUserId: 7,
    bytes: "PRIVATE_BYTES", AppUser: { email: "PRIVATE_EMAIL" } };
}
const scalar = value => Object.prototype.toString.call(value) === "[object Date]" ? value.getTime() : value;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some(branch => matches(row, branch));
    if (key === "AND") return condition.every(branch => matches(row, branch));
    const actual = scalar(row[key]);
    if (condition && typeof condition === "object" && scalar(condition) === condition) {
      return Object.entries(condition).every(([operator, expected]) => {
        if (operator === "in") return expected.includes(actual);
        if (operator === "lt") return actual < scalar(expected);
        throw new Error(`Unsupported operator: ${operator}`);
      });
    }
    return actual === scalar(condition);
  });
}
function ordered(rows, orderBy = []) {
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      const [field, direction] = Object.entries(clause)[0];
      const delta = scalar(a[field]) - scalar(b[field]);
      if (delta) return direction === "desc" ? -delta : delta;
    }
    return 0;
  });
}
function harness(options = {}, mutation) {
  const rows = options.rows ?? [];
  const calls = [];
  const queries = [];
  const members = [{ id: 17, dniFrontUrl: "legacy/front", dniBackUrl: "legacy/back", photoUrl: "legacy/photo" }, { id: 18 }];
  const db = {
    appUser: { findUnique: async () => {
      calls.push("auth");
      if (options.fail === "auth") throw new Error("PRIVATE_PRISMA_ERROR");
      return options.missingUser ? null : { id: 7, active: options.active ?? true, role: options.role ?? "STAFF" };
    } },
    member: { findUnique: async query => {
      calls.push("member"); queries.push({ kind: "member", query });
      if (options.fail === "member") throw new Error("PRIVATE_PRISMA_ERROR");
      const found = members.find(member => member.id === query.where.id);
      return found ? { id: found.id } : null;
    } },
    memberDocument: {
      groupBy: async query => {
        calls.push("group"); queries.push({ kind: "group", query });
        if (options.fail === "group") throw new Error("PRIVATE_PRISMA_ERROR");
        const groups = new Map();
        for (const item of rows.filter(row => matches(row, query.where))) {
          const key = item.type;
          const result = groups.get(key) ?? { type: key, _max: {} };
          for (const field of Object.keys(query._max)) {
            if (result._max[field] === undefined || scalar(item[field]) > scalar(result._max[field])) result._max[field] = item[field];
          }
          groups.set(key, result);
        }
        return [...groups.values()];
      },
      findMany: async query => {
        calls.push("list"); queries.push({ kind: "list", query });
        if (options.fail === "list") throw new Error("PRIVATE_PRISMA_ERROR");
        return ordered(rows.filter(row => matches(row, query.where)), query.orderBy).slice(0, query.take)
          .map(row => options.extraFields || !query.select ? { ...row } :
            Object.fromEntries(Object.keys(query.select).map(key => [key, row[key]])));
      },
      findFirst: async query => {
        const winner = ordered(rows.filter(row => matches(row, query.where)), query.orderBy)[0];
        return winner ? Object.fromEntries(Object.keys(query.select).map(key => [key, winner[key]])) : null;
      },
    },
    $transaction: async (callback, config) => {
      calls.push("transaction");
      assert.equal(config.isolationLevel, "RepeatableRead");
      return callback(db);
    },
  };
  const mocks = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth": { authConfig: {} },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: options.sessionId ?? "7", role: options.jwtRole ?? "MEMBER" } } },
    "@/lib/member-document-writer": { MemberDocumentUploadError: class extends Error {} },
    "@/lib/member-document-form": {},
    // Used only when explicitly testing the unchanged DNI resolver; never by GET.
    "@/lib/storage": { STORAGE_BUCKET: "club-uploads", parseStorageUrl: () => { throw new Error("Unexpected legacy read"); } },
  };
  const loaded = [];
  const modules = {};
  function load(path) {
    if (modules[path]) return modules[path];
    loaded.push(path);
    const exports = {}; modules[path] = exports;
    let source = read(path);
    if (mutation?.path === path) {
      assert.ok(source.includes(mutation.from), `Mutation target missing: ${mutation.name}`);
      source = source.replace(mutation.from, mutation.to);
    }
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports, Buffer, Request, Response, URL, console,
      process: { env: { AUTH_SECRET: options.noSecret ? undefined : testSecret } },
      require: name => mocks[name] ?? (name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name)),
    });
    return exports;
  }
  return { rows, calls, queries, members, loaded, load,
    get: (query = "", id = "17") => load(route).GET(new Request(`http://local/member-documents?${query}`), { params: Promise.resolve({ id }) }),
  };
}
async function response(h, query = "", id = "17", status = 200) {
  const res = await h.get(query, id);
  assert.equal(res.status, status);
  assert.equal(res.headers.get("cache-control"), cacheControl);
  return res.json();
}
function verifyQueries(h, memberId = 17) {
  for (const { kind, query } of h.queries) {
    assert.equal(kind === "member" ? query.where.id : query.where.memberId, memberId);
    if (kind === "list") {
      assert.deepEqual(Object.keys(query.select ?? {}).sort(), [...fields].sort());
      assert.deepEqual(plain(query.orderBy), [{ createdAt: "desc" }, { id: "desc" }]);
      assert.ok(query.take <= 101);
    }
  }
}

test("persisted auth precedes member existence and query validation", async () => {
  for (const [options, status] of [[{ noSession: true }, 401], [{ missingUser: true }, 401],
    [{ active: false }, 401], [{ sessionId: "0" }, 401], [{ sessionId: "bad" }, 401],
    [{ role: "MEMBER", jwtRole: "ADMIN" }, 403]]) {
    const h = harness(options);
    await response(h, "view=invalid", "0", status);
    assert.equal(h.queries.length, 0);
  }
  for (const role of ["STAFF", "ADMIN"]) await response(harness({ role, jwtRole: "MEMBER" }));
  const options = { role: "STAFF" }; const h = harness(options);
  await response(h); options.role = "MEMBER";
  const before = h.queries.length;
  await response(h, "", "17", 403);
  assert.equal(h.queries.length, before);
});

test("strict member IDs and missing/empty members", async () => {
  for (const id of ["0", "-1", "1.5", "1e2", " 17", "17 ", "017", "2147483648", "9007199254740992", "abc"]) {
    const h = harness(); assert.deepEqual(await response(h, "", id, 400), { error: "INVALID_MEMBER_ID" });
    assert.equal(h.queries.length, 0);
  }
  const missing = harness();
  assert.deepEqual(await response(missing, "", "2147483647", 404), { error: "MEMBER_NOT_FOUND" });
  assert.deepEqual(missing.calls, ["auth", "member"]);
  const h = harness(); assert.deepEqual(await response(h), { items: [], nextCursor: null });
  assert.deepEqual(h.calls, ["auth", "member", "transaction", "group"]);
  assert.deepEqual(plain(h.queries[0].query.select), { id: true });
});

async function orderContract(mutation) {
  const rows = [row(90, "OTHER", "2026-09-01"), row(2), row(3), row(999, "OTHER", "2027-01-01", 18)];
  const h = harness({ rows }, mutation);
  const all = await response(h);
  assert.deepEqual(all.items.map(item => item.id), [3, 2, 90]);
  assert.deepEqual(all.items.map(item => item.isCurrent), [true, false, false]);
  verifyQueries(h);
}
test("date first, ID tie-break, member scope and max ID restricted to max date", () => orderContract());

async function dtoContract(mutation) {
  const h = harness({ rows: types.map((type, index) => row(index + 1, type)), extraFields: true }, mutation);
  const body = await response(h);
  assert.deepEqual(body.items.map(item => item.type), [...types].reverse());
  for (const item of body.items) {
    assert.deepEqual(Object.keys(item).sort(), [...fields, "isCurrent"].sort());
    assert.equal(item.createdAt, "2026-10-02T12:00:00.000Z");
    assert.equal(item.isCurrent, true);
  }
  assert.doesNotMatch(JSON.stringify(body), /storageBucket|storageKey|sha256|createdByUserId|AppUser|PRIVATE_|https?:/);
  verifyQueries(h);
}
test("six types, explicit query projection and exact DTO even with extra returned fields", () => dtoContract());

test("current is at most six rows, globally selected, with unchanged DNI winners", async () => {
  const rows = types.flatMap((type, index) => [row(index + 1, type), row(index + 11, type)]);
  rows.push(row(999, "ID_FRONT", "2027-01-01", 18));
  const h = harness({ rows });
  const current = await response(h, "view=current");
  assert.deepEqual(current.items.map(item => item.id), [16, 15, 14, 13, 12, 11]);
  assert.ok(current.items.every(item => item.isCurrent));
  assert.equal(current.nextCursor, null);
  assert.equal(h.queries.filter(q => q.kind !== "member").length, 3);
  verifyQueries(h);
  const resolver = h.load("lib/member-dni.ts");
  for (const [side, type] of [["front", "ID_FRONT"], ["back", "ID_BACK"]]) {
    const dni = await resolver.resolveMemberDni(17, side, "ignored-legacy");
    assert.equal(dni.storageKey, `PRIVATE_KEY/${current.items.find(item => item.type === type).id}`);
  }
});

async function globalContract(mutation) {
  const h = harness({ rows: [row(1), row(2), row(3)] }, mutation);
  const first = await response(h, "limit=1");
  assert.equal(first.items[0].isCurrent, true);
  const second = await response(h, `limit=1&cursor=${first.nextCursor}`);
  assert.equal(second.items[0].id, 2);
  assert.equal(second.items[0].isCurrent, false, "winner is outside this page");
}
test("isCurrent is global across page boundaries", () => globalContract());

async function limitContract(mutation) {
  await response(harness({}, mutation), "limit=101", "17", 400);
}
test("default 50, maximum 100, strict limit/view and no pagination options for current", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => row(index + 1));
  assert.equal((await response(harness({ rows }))).items.length, 50);
  assert.equal((await response(harness({ rows }), "limit=100")).items.length, 100);
  for (const value of ["0", "-1", "1.2", "1e2", "", "01", "%205", "101", "Infinity", "9007199254740992"]) {
    await response(harness(), `limit=${value}`, "17", 400);
  }
  for (const query of ["view=", "view=other", "view=ALL", "view=all&view=current", "limit=1&limit=2",
    "view=current&limit=1", "view=current&cursor=abc", "cursor=a&cursor=b"]) {
    await response(harness(), query, "17", 400);
  }
});

test("keyset continuity across timestamps and ties, no duplicates or omissions", async () => {
  const rows = Array.from({ length: 113 }, (_, index) => row(index + 1, types[index % 6], index % 2 ? "2026-10-01" : "2026-10-02"));
  const h = harness({ rows }); const ids = []; let cursor = null;
  do {
    const body = await response(h, `limit=7${cursor ? `&cursor=${cursor}` : ""}`);
    ids.push(...body.items.map(item => item.id)); cursor = body.nextCursor;
    assert.ok(ids.length <= 113);
  } while (cursor);
  const expected = rows.slice().sort((a, b) => b.createdAt - a.createdAt || b.id - a.id).map(row => row.id);
  assert.deepEqual(ids, expected); assert.equal(new Set(ids).size, 113);
  verifyQueries(h);
});

test("limit 1 and 100: extra row is withheld and cursor points to last delivered row", async () => {
  for (const limit of [1, 100]) {
    const h = harness({ rows: Array.from({ length: limit + 1 }, (_, index) => row(index + 1)) });
    const first = await response(h, `limit=${limit}`);
    assert.equal(first.items.length, limit);
    assert.equal(h.queries.find(query => query.kind === "list").query.take, limit + 1);
    assert.equal(first.items.at(-1).id, 2);
    const position = JSON.parse(Buffer.from(first.nextCursor.split(".")[0], "base64url").toString());
    assert.deepEqual(position, [1, 17, first.items.at(-1).createdAt, 2]);
    const last = await response(h, `limit=${limit}&cursor=${first.nextCursor}`);
    assert.deepEqual(last.items.map(item => item.id), [1]);
    assert.equal(last.items[0].isCurrent, false);
    assert.equal(last.nextCursor, null);
  }
});

test("cursor validation and cross-context/tampered cursor never bypass member scope", async () => {
  for (const cursor of ["", "!", "a".repeat(257), "null", encode(null), encode([1, 17]),
    encode([2, 17, "2026-10-02T12:00:00.000Z", 1]), encode([1, 17, "bad", 1]),
    encode([1, 17, "2026-10-02", 1]), encode([1, 17, "2026-10-02T12:00:00.000Z", 0]),
    encode([1, 17, "2026-10-02T12:00:00.000Z", 2147483648]),
    encode([1, 17, "2026-02-30T12:00:00.000Z", 1]),
    encode([1, 17, "2026-10-02T12:00:00.000Z", "1"]),
    encode([1, 17, "2026-10-02T12:00:00.000Z", NaN]),
    encode([1, 17, "2026-10-02T12:00:00.000Z", 1.5]),
    signPayload(Buffer.from('[1,17,"2026-10-02T12:00:00.000Z",NaN]').toString("base64url")),
    signPayload(Buffer.from('[1,17,"2026-10-02T12:00:00.000Z",1e999]').toString("base64url"))]) {
    await response(harness(), `cursor=${cursor}`, "17", 400);
  }
  const h = harness({ rows: [row(1), row(2), row(3), row(10, "OTHER", "2026-10-01", 18)] });
  const first = await response(h, "limit=1");
  await response(h, `cursor=${first.nextCursor}`, "18", 400);
  const [payload, signature] = first.nextCursor.split(".");
  const original = JSON.parse(Buffer.from(payload, "base64url").toString());
  const before = h.queries.length;
  for (const [index, value, memberId] of [[1, 18, "18"], [2, "2026-10-01T12:00:00.000Z", "17"], [3, 1, "17"]]) {
    const forged = [...original]; forged[index] = value;
    const tampered = `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`;
    await response(h, `cursor=${tampered}&memberId=17&storageKey=PRIVATE_KEY`, memberId, 400);
  }
  await response(h, `cursor=${payload}`, "17", 400);
  await response(h, `cursor=${payload}.${"0".repeat(64)}`, "17", 400);
  assert.equal(h.queries.length, before);
});

async function cursorScopeContract(mutation) {
  const h = harness({ rows: [row(1), row(2)] }, mutation);
  const { nextCursor } = await response(h, "limit=1");
  await response(h, `cursor=${nextCursor}`, "18", 400);
}

test("missing signing configuration fails closed with generic 500", async () => {
  const h = harness({ noSecret: true, rows: [row(1), row(2)] });
  for (const query of ["limit=1", `cursor=${encode([1, 17, "2026-10-02T12:00:00.000Z", 2])}`]) {
    assert.deepEqual(await response(h, query, "17", 500), { error: "MEMBER_DOCUMENT_LIST_FAILED" });
  }
});

test("legacy/photo/contracts/snapshots excluded; GET makes no writes or Storage calls", async () => {
  const h = harness(); const before = plain(h.members);
  assert.deepEqual(await response(h), { items: [], nextCursor: null });
  assert.deepEqual(plain(h.members), before); assert.equal(h.rows.length, 0);
  assert.ok(h.loaded.every(path => !/storage|contract|snapshot|member-dni/.test(path)));
});

test("controlled errors and cache headers including auth, member and document failures", async () => {
  for (const fail of ["auth", "member", "group", "list"]) {
    const body = await response(harness({ fail, rows: [row(1)] }), "", "17", 500);
    assert.deepEqual(body, { error: "MEMBER_DOCUMENT_LIST_FAILED" });
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|Prisma|Storage/);
  }
});

// Execute in-memory source mutants. The same contracts must reject each weakened
// implementation, rather than just checking that a source substring exists.
const mutations = [
  { name: "remove id DESC", path: helper, from: '{ createdAt: "desc" }, { id: "desc" }', to: '{ createdAt: "desc" }', check: orderContract },
  { name: "remove memberId scope", path: helper, from: 'const scope = { memberId, type:', to: 'const scope = { type:', check: orderContract },
  { name: "remove memberId from page query", path: helper, from: '        ...scope,', to: '        type: scope.type,', check: orderContract },
  { name: "remove memberId from winner query", path: helper, from: 'where: { ...scope, OR:', to: 'where: { type: scope.type, OR:', check: orderContract },
  { name: "remove explicit projection", path: helper,
    from: 'select: { id: true, type: true, originalName: true, mimeType: true, byteLength: true, createdAt: true },', to: '', check: dtoContract },
  { name: "page-local current", path: helper, from: 'isCurrent: currentIds.includes(row.id)',
    to: 'isCurrent: page.find(item => item.type === row.type)?.id === row.id', check: globalContract },
  { name: "remove maximum limit", path: helper, from: ' || limit > 100', to: '', check: limitContract },
  { name: "trust cursor owner instead of route context", path: helper, from: 'const [version, owner, date, id] = decoded;',
    to: 'const [version, owner, date, id] = decoded; memberId = owner;', check: cursorScopeContract },
  { name: "downgrade to requireAuth", path: route, from: 'import { requireStaffOrAdmin }',
    to: 'import { requireAuth as requireStaffOrAdmin }', check: async mutation => {
      const h = harness({ role: "MEMBER" }, mutation); await response(h, "", "17", 403); assert.equal(h.queries.length, 0);
    } },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, async () => {
  assert.ok(read(mutation.path).includes(mutation.from), `Mutation target missing: ${mutation.name}`);
  await assert.rejects(() => mutation.check(mutation), { name: "AssertionError" });
});
