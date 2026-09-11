// Isolated regression checks: actual hooks/routes/engine, simulated React scheduler,
// HTTP and Prisma. No database, browser, credentials or additional dependencies.
// Run: node scripts/test-sales-rfid.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
function loader(mocks, globals = {}) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, name.slice(2) + ".ts");
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(code, {
      exports, require: load, console, Response, Request, URL, Buffer, AbortSignal, SyntaxError,
      crypto: globalThis.crypto, ...globals,
    }, { filename });
    return exports;
  }
  return load;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const product = { id: 1, name: "Product", unit: "UD", price: 10, stock: 100, active: true };
const members = [1, 2].map(id => ({ id, fullName: `Member ${id}`, dni: String(id), discountPercent: 10 }));
const totals = { grams: 0, units: 0, monthlyGrams: 0, limits: { dailyLimitG: 10, dailyLimitUd: 15, monthlyLimitG: 30 } };

async function pageHarness() {
  const slots = [];
  let cursor = 0, dirty = true, page;
  const effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => {
        const value = typeof next === "function" ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const requests = [];
  const lookupTimeouts = [];
  let lookup = async () => Response.json({ id: 1, fullName: "Member 1" });
  let sale = async () => Response.json({ sales: [{ id: 1, memberId: Number(page.memberId) }], totalAmount: 9 });
  const fetchJson = async url => {
    if (url === "/api/members") return members;
    if (url === "/api/products") return [product];
    if (url.endsWith("/today")) return totals;
    if (url.endsWith("/operational-status")) return { member: members[Number(url.split("/")[3]) - 1], canWithdraw: true };
    return { sales: [], dayClosed: false };
  };
  const load = loader({ react, "@/lib/fetch-json": { fetchJson } }, {
    AbortSignal: { timeout(ms) {
      assert.equal(ms, 15_000);
      const controller = new AbortController(); lookupTimeouts.push(controller);
      return controller.signal;
    } },
    window: { setTimeout: () => 1, clearTimeout() {} },
    fetch: (url, options) => {
      if (url.startsWith("/api/members/by-rfid/")) return lookup(url, options);
      requests.push(JSON.parse(options.body));
      return sale();
    },
  });
  const { useSalesPage } = load("@/hooks/use-sales-page");
  async function flush() {
    for (let i = 0; i < 12; i++) {
      if (dirty) {
        dirty = false; cursor = 0;
        // This test scheduler renders the hook with a simulated React dispatcher.
        // eslint-disable-next-line react-hooks/rules-of-hooks
        page = useSalesPage();
      }
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
    }
  }
  await flush();
  return {
    get page() { return page; }, requests, flush,
    lookup(fn) { lookup = fn; }, sale(fn) { sale = fn; },
    expireLookup() { lookupTimeouts.at(-1).abort(); },
    async manual(id = "1") { page.handleMemberChange(id); await flush(); },
    async cart() { page.addProduct(product); await flush(); page.updateInputMode(1, "QTY"); await flush(); },
    async scan(code = "000001") {
      page.setRfidInput(code); await flush();
      const promise = page.handleRfidSubmit({ preventDefault() {} });
      return { promise };
    },
  };
}

// A/D + every HTTP/JSON failure: clear before await, even stale submit callbacks.
for (const failure of [404, 401, 403, 429, 500, "network", "json", "shape"]) {
  const h = await pageHarness();
  await h.manual(); await h.cart();
  const oldSubmit = h.page.handleRegisterWithdrawal;
  const pending = deferred(); h.lookup(() => pending.promise);
  const { promise } = await h.scan();
  await oldSubmit(); await h.flush();
  assert.equal(h.page.memberId, ""); assert.equal(h.page.cartLines.length, 0);
  assert.equal(h.page.memberStatus, null); assert.equal(h.page.invalid, true);
  assert.equal(h.requests.length, 0); // C: pending cannot submit A.
  if (failure === "network") pending.reject(new Error("offline"));
  else if (failure === "json") pending.resolve(new Response("invalid"));
  else if (failure === "shape") pending.resolve(Response.json({}));
  else pending.resolve(Response.json({ error: "Unavailable" }, { status: failure }));
  await promise; await h.flush();
  assert.equal(h.page.memberId, ""); assert.ok(h.page.rfidError);
  // Reader recovers after each failure.
  h.lookup(async () => Response.json({ id: 2, fullName: "Member 2" }));
  await (await h.scan()).promise; await h.flush();
  assert.equal(h.page.memberId, "2");
}

{
  const h = await pageHarness(); await h.manual(); await h.cart();
  h.lookup(async () => Response.json({ id: 2, fullName: "Member 2" }));
  await (await h.scan(" 000002 \n")).promise; await h.flush();
  assert.equal(h.page.memberId, "2"); assert.equal(h.page.cartLines.length, 0); // B
  await h.cart(); await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests[0].memberId, 2); assert.equal(h.requests[0].expectedRfidCode, "000002");
  assert.equal(h.page.memberId, "2"); assert.equal(h.page.cartLines.length, 0); // K
  await h.cart(); await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.notEqual(h.requests[0].idempotencyKey, h.requests[1].idempotencyKey);
  await h.manual("1"); await h.cart(); await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests[2].memberId, 1); assert.ok(!("expectedRfidCode" in h.requests[2])); // G/H/N
  h.page.handleNextMember(); await h.flush();
  assert.equal(h.page.memberId, ""); assert.equal(h.page.cartLines.length, 0); // J
}
for (const change of ["manual", "next", "cart", "new-scan"]) {
  const h = await pageHarness(); const pending = deferred(); h.lookup(() => pending.promise);
  const { promise } = await h.scan(); await h.flush();
  if (change === "manual") await h.manual("2");
  if (change === "next") h.page.handleNextMember();
  if (change === "cart") await h.cart();
  if (change === "new-scan") {
    h.lookup(async () => Response.json({ id: 2, fullName: "Member 2" }));
    await (await h.scan("000002")).promise;
  }
  pending.resolve(Response.json({ id: 1, fullName: "Member 1" }));
  await promise; await h.flush();
  assert.equal(h.page.memberId, ["manual", "new-scan"].includes(change) ? "2" : ""); // I/P
}
{
  const h = await pageHarness(); await (await h.scan()).promise; await h.flush(); await h.cart();
  h.sale(async () => Response.json({ code: "RFID_ASSIGNMENT_CHANGED", error: "Revoked" }, { status: 409 }));
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.page.memberId, ""); assert.equal(h.page.cartLines.length, 0);
  assert.match(h.page.rfidError, /Identifica de nuevo/); assert.equal(h.page.withdrawalFeedback, null); // E/F
}
{
  const h = await pageHarness(); await h.manual(); await h.cart();
  const pending = deferred(); h.sale(() => pending.promise);
  const submit = h.page.handleRegisterWithdrawal;
  const first = submit(); await submit(); assert.equal(h.requests.length, 1); // Q
  pending.reject(new Error("uncertain")); await first; await h.flush();
  assert.equal(h.requests.length, 1); // No automatic retry.
  h.sale(async () => Response.json({ sales: [{ id: 1, memberId: 1 }], totalAmount: 9 }));
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests[0].idempotencyKey, h.requests[1].idempotencyKey);
}
console.log("PASS frontend A-K, N, P-Q; HTTP/network/JSON, superseded responses and reader recovery");

{
  const h = await pageHarness(); await h.manual(); await h.cart();
  h.lookup((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("timeout")));
  }));
  const { promise } = await h.scan(); h.expireLookup(); await promise; await h.flush();
  assert.equal(h.page.memberId, ""); assert.ok(h.page.rfidError);
  h.lookup(async () => Response.json({ id: 1, fullName: "Member 1" }));
  await (await h.scan()).promise; await h.flush(); assert.equal(h.page.memberId, "1");
}

// Real engine with transactional, rollback-capable Prisma double.
const { Prisma, SaleOperationType } = require("@prisma/client");
let lockError = null;
let replayError = null, transactionFailure = null, auditError = null;
let transactionQueue = Promise.resolve();
let rfid = "000001", state = { operations: [], sales: [], stock: 100, moves: [], cash: [] };
const calls = [];
const prisma = {
  saleOperation: { findUnique: async ({ where }) => {
    if (replayError) throw replayError;
    const key = where.operatorUserId_idempotencyKey;
    return state.operations.find(x => x.idempotencyKey === key.idempotencyKey && x.operatorUserId === key.operatorUserId) ?? null;
  } },
  async $transaction(fn, options) {
    // Serialize the double to enforce its unique constraint; this is not a
    // simulation or proof of PostgreSQL's lock/snapshot scheduling.
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
    if (transactionFailure === "before") throw new Error("P1001 simulated connection failure");
    assert.equal(options.isolationLevel, "Serializable");
    const draft = structuredClone(state);
    const tx = {
      $queryRaw: async (sql, id) => {
        if (lockError) throw lockError;
        assert.match(sql.join("?"), /WHERE "id" = \? FOR UPDATE/); assert.equal(id, 1);
        calls.push("lock"); return [{ rfidCode: rfid }];
      },
      saleOperation: {
        create: async ({ data }) => {
          if (draft.operations.some(x => x.idempotencyKey === data.idempotencyKey && x.operatorUserId === data.operatorUserId)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test", meta: { target: ["operatorUserId", "idempotencyKey"] } });
          const op = { id: draft.operations.length + 1, ...data }; draft.operations.push(op); return op;
        },
        update: async ({ where, data }) => Object.assign(draft.operations.find(x => x.id === where.id), data),
      },
      dayClosure: { findUnique: async () => null },
      member: { findUnique: async () => ({ ...members[0], active: true, expiresAt: null, commercialProfile: "STANDARD" }) },
      memberContract: { findFirst: async () => ({ id: 1, consumptionGrams: 30 }) },
      product: {
        findMany: async () => [{ ...product, stock: draft.stock, averageCost: 2 }],
        updateMany: async ({ data }) => { calls.push("stock"); draft.stock -= data.stock.decrement; return { count: 1 }; },
      },
      sale: {
        findMany: async () => [],
        create: async ({ data }) => {
          calls.push("sale"); const record = { id: draft.sales.length + 1, ...data, createdAt: new Date(), updatedAt: new Date(), cancelledAt: null, cancelReason: null, cancelledByUserId: null };
          draft.sales.push(record); return record;
        },
      },
      stockMove: { create: async ({ data }) => { calls.push("move"); draft.moves.push(data); } },
      cashMove: { create: async ({ data }) => { calls.push("cash"); draft.cash.push(data); } },
    };
    const result = await fn(tx);
    if (transactionFailure === "rollback") throw new Error("simulated disconnect before commit");
    state = draft; return result;
    } finally { release(); }
  },
};
const load = loader({
  "@/lib/prisma": { prisma },
  "@/lib/audit": { createAuditLog: async data => {
    if (auditError) throw auditError;
    assert.ok(!JSON.stringify(data).includes("000001"));
  } },
  "@/lib/club-settings": { getClubSettings: async () => ({ dailyLimitG: 10, dailyLimitUd: 15 }) },
  "@/lib/auth-server": { requireStaffOrAdmin: async () => ({ ok: true, session: { user: { id: "1", role: "STAFF" } } }) },
});
const engine = load("@/lib/sales-engine");
const base = { memberId: 1, items: [{ productId: 1, qty: 1 }], operatorUserId: 1, operationType: SaleOperationType.BULK };
for (const current of [null, "000002"]) {
  rfid = current; calls.length = 0; const before = plain(state);
  await assert.rejects(engine.createSaleTransaction({ ...base, expectedRfidCode: "000001", idempotencyKey: crypto.randomUUID() }), engine.RfidAssignmentChangedError);
  assert.deepEqual(plain(state), before); assert.deepEqual(calls, ["lock"]); // M/O
}
rfid = "000001"; calls.length = 0;
const key = crypto.randomUUID();
const result = await engine.createSaleTransaction({ ...base, expectedRfidCode: " 000001 \n", idempotencyKey: key });
assert.deepEqual(calls, ["lock", "stock", "sale", "move", "cash"]); // L
assert.equal(result.totalAmount, 9); assert.equal(state.stock, 99); assert.equal(state.cash[0].paymentMethod, "CASH");
rfid = null; const beforeReplay = plain(state);
const replay = await engine.createSaleTransaction({ ...base, expectedRfidCode: "000001", idempotencyKey: key });
assert.equal(replay.idempotentReplay, true); assert.deepEqual(plain(state), beforeReplay); // Q: completed sale, not a new sale
lockError = { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } };
const serializationReplay = await engine.createSaleTransaction({ ...base, expectedRfidCode: "000001", idempotencyKey: key });
assert.equal(serializationReplay.idempotentReplay, true); assert.deepEqual(plain(state), beforeReplay);
await assert.rejects(engine.createSaleTransaction({ ...base, expectedRfidCode: "000001", idempotencyKey: crypto.randomUUID() }));
assert.deepEqual(plain(state), beforeReplay);
lockError = null;
await assert.rejects(engine.createSaleTransaction({ ...base, expectedRfidCode: "000002", idempotencyKey: key }), engine.IdempotencyConflictError);
await assert.rejects(engine.createSaleTransaction({ ...base, idempotencyKey: key }), engine.IdempotencyConflictError);
calls.length = 0;
await engine.createSaleTransaction({ ...base, idempotencyKey: crypto.randomUUID() });
assert.ok(!calls.includes("lock")); assert.equal(state.sales.length, 2); // N
for (const path of ["@/app/api/sales/route", "@/app/api/sales/bulk/route"]) {
  const { POST } = load(path);
  const body = path.includes("bulk") ? { memberId: 1, items: base.items } : { memberId: 1, productId: 1, qty: 1 };
  const before = plain(state);
  const response = await POST(new Request("http://test/api/sales", { method: "POST", body: JSON.stringify({ ...body, expectedRfidCode: "000002" }) }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, "RFID_ASSIGNMENT_CHANGED");
  assert.deepEqual(plain(state), before);
  const invalid = await POST(new Request("http://test/api/sales", { method: "POST", body: JSON.stringify({ ...body, expectedRfidCode: null }) }));
  assert.equal(invalid.status, 400);
}
console.log("PASS backend L-O/Q; rollback, normalized evidence, lock order, discounts/CASH and both HTTP routes");

// Full P2 regression: real frontend -> real bulk route -> real engine -> double.
const bulkPost = load("@/app/api/sales/bulk/route").POST;
const request = body => new Request("http://test/api/sales", { method: "POST", body: JSON.stringify(body) });
const resetDb = () => {
  state = { operations: [], sales: [], stock: 100, moves: [], cash: [] };
  lockError = replayError = transactionFailure = auditError = null;
  rfid = "000001";
};
for (const failure of ["lost", "before", "rollback", "after-commit", "html-200", "html-400", "shape-200", "unknown-400"]) {
  resetDb();
  const h = await pageHarness(); await (await h.scan()).promise; await h.flush(); await h.cart();
  const send = () => bulkPost(request(h.requests.at(-1)));
  transactionFailure = ["before", "rollback"].includes(failure) ? failure : null;
  if (failure === "after-commit") auditError = new Error("post-commit failure");
  h.sale(async () => {
    const response = await send();
    if (failure === "lost") throw new Error("response lost after commit");
    if (failure.startsWith("html-")) return new Response("<html>gateway</html>", { status: Number(failure.slice(5)) });
    if (failure === "shape-200") return Response.json({ sales: [] });
    if (failure === "unknown-400") return Response.json({ error: "proxy error" }, { status: 400 });
    return response;
  });
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests.length, 1); // Never retries automatically.
  assert.equal(h.page.cartLines.length, 1);
  assert.equal(h.page.withdrawalFeedback.title, "No se pudo confirmar el registro");
  const originalKey = h.requests[0].idempotencyKey;
  const committed = !["before", "rollback"].includes(failure);
  assert.equal(state.sales.length, committed ? 1 : 0);
  const uncertainState = plain(state);
  transactionFailure = auditError = null;
  if (committed) rfid = null; // Historical replay must survive revocation.
  // Retrieval itself fails: 500 generic, same K, no writes, still uncertain.
  replayError = new Error("P1001 SQL secret should not escape");
  h.sale(async () => {
    const response = await send(); assert.equal(response.status, 500);
    const payload = await response.clone().json();
    assert.equal(payload.code, "SALE_RESULT_UNCONFIRMED");
    assert.ok(!JSON.stringify(payload).includes("secret"));
    return response;
  });
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests[1].idempotencyKey, originalKey);
  assert.deepEqual(plain(state), uncertainState);
  assert.equal(h.page.withdrawalFeedback.title, "No se pudo confirmar el registro");
  replayError = null; h.sale(send);
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.equal(h.requests[2].idempotencyKey, originalKey);
  assert.equal(h.requests.length, 3);
  assert.equal(state.sales.length, 1); assert.equal(state.operations.length, 1);
  assert.equal(state.moves.length, 1); assert.equal(state.cash.length, 1); assert.equal(state.stock, 99);
  assert.equal(h.page.cartLines.length, 0); assert.equal(h.page.withdrawalFeedback.kind, "success");
}

resetDb();
const concurrentKey = crypto.randomUUID();
const payload = { ...base, expectedRfidCode: "000001", idempotencyKey: concurrentKey };
await Promise.all([bulkPost(request(payload)), bulkPost(request(payload))]).then(responses => {
  assert.ok(responses.every(response => response.status === 200));
});
assert.equal(state.sales.length, 1); assert.equal(state.operations.length, 1);
const saved = plain(state);
for (const revoked of [null, "000002"]) {
  rfid = revoked;
  const replay = await bulkPost(request(payload)); assert.equal(replay.status, 200);
  const fresh = await bulkPost(request({ ...payload, idempotencyKey: crypto.randomUUID() }));
  assert.equal(fresh.status, 409); assert.equal((await fresh.json()).code, "RFID_ASSIGNMENT_CHANGED");
  assert.deepEqual(plain(state), saved);
}
for (const changed of [{ items: [{ productId: 1, qty: 2 }] }, { expectedRfidCode: undefined }, { expectedRfidCode: "000002" }]) {
  const response = await bulkPost(request({ ...payload, ...changed }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, "IDEMPOTENCY_CONFLICT");
  assert.deepEqual(plain(state), saved);
}
await assert.rejects(engine.createSaleTransaction({ ...payload, operatorUserId: 2 }), engine.RfidAssignmentChangedError);
assert.deepEqual(plain(state), saved); // Operator 2 cannot retrieve operator 1's K.

// Both routes hide infrastructure and unavailable/corrupt historical responses.
for (const path of ["@/app/api/sales/route", "@/app/api/sales/bulk/route"]) {
  const POST = load(path).POST;
  const body = path.includes("bulk") ? payload : { memberId: 1, productId: 1, qty: 1, idempotencyKey: crypto.randomUUID() };
  replayError = new Error("Prisma SQL private details");
  const response = await POST(request(body)); assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "SALE_RESULT_UNCONFIRMED");
  replayError = null;
  const malformed = await POST(new Request("http://test/api/sales", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const interrupted = await POST({ json: async () => { throw new Error("connection interrupted"); } });
  assert.equal(interrupted.status, 500);
}
for (const patch of [{ status: "PENDING" }, { response: null }, { response: {} }]) {
  state = structuredClone(saved); Object.assign(state.operations[0], patch);
  const response = await bulkPost(request(payload)); assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "SALE_RESULT_UNCONFIRMED");
}
console.log("PASS P2: lost/invalid response, pre-commit failure/rollback, post-commit failure, K retained through recovery failure, revocation, fingerprint/operator scope and concurrent submissions (serialized double)");

// An explicit business rejection still ends the attempt (no committed effects).
resetDb(); state.stock = 0;
const rejected = await pageHarness(); await rejected.manual(); await rejected.cart();
rejected.sale(() => bulkPost(request(rejected.requests.at(-1))));
await rejected.page.handleRegisterWithdrawal(); await rejected.flush();
assert.equal(rejected.page.withdrawalFeedback.title, "No se pudo registrar la retirada");
assert.equal(state.sales.length, 0); assert.equal(state.operations.length, 0);
state.stock = 100;
await rejected.page.handleRegisterWithdrawal(); await rejected.flush();
assert.notEqual(rejected.requests[0].idempotencyKey, rejected.requests[1].idempotencyKey);
assert.equal(state.sales.length, 1);

// Conflict is not an uncertain retry: real route/engine bind K to another intent.
for (const resolution of ["next", "rfid"]) {
  resetDb();
  const h = await pageHarness(); await h.manual(); await h.cart();
  h.sale(async () => {
    const body = h.requests.at(-1);
    const confirmed = await bulkPost(request({ ...body, items: [{ productId: 1, qty: 2 }] }));
    assert.equal(confirmed.status, 200);
    const conflict = await bulkPost(request(body));
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.clone().json()).code, "IDEMPOTENCY_CONFLICT");
    return conflict;
  });
  const oldRegister = h.page.handleRegisterWithdrawal;
  await oldRegister();
  await oldRegister(); // B/double click: no render between response and second call.
  await h.flush();
  const originalKey = h.requests[0].idempotencyKey;
  assert.equal(h.requests.length, 1); assert.equal(state.sales.length, 1);
  assert.equal(h.page.invalid, true); assert.equal(h.page.cartLines.length, 1);
  assert.equal(h.page.withdrawalFeedback.title, "Retirada bloqueada por conflicto");
  assert.match(h.page.withdrawalFeedback.message, /Siguiente socio/);
  h.page.updateQty(1, "3"); await h.flush(); // C: quantity editing is not a reset.
  await h.page.handleRegisterWithdrawal();
  assert.equal(h.requests.length, 1); assert.equal(h.page.invalid, true);
  assert.equal(h.page.withdrawalFeedback.title, "Retirada bloqueada por conflicto");
  await h.manual("2"); await h.cart(); // A manual selection also cannot silently resolve it.
  await h.page.handleRegisterWithdrawal();
  assert.equal(h.requests.length, 1); assert.equal(h.page.invalid, true);
  if (resolution === "next") {
    h.page.handleNextMember(); await h.flush();
    assert.equal(h.page.memberId, "");
  } else {
    const pending = deferred(); h.lookup(() => pending.promise);
    const { promise } = await h.scan(); await h.flush();
    assert.equal(h.page.memberId, ""); assert.equal(h.page.cartLines.length, 0);
    await h.page.handleRegisterWithdrawal(); assert.equal(h.requests.length, 1);
    pending.resolve(Response.json({ id: 1, fullName: "Member 1" }));
    await promise; await h.flush();
  }
  assert.equal(h.page.withdrawalFeedback, null); assert.equal(h.page.cartLines.length, 0);
  assert.equal(h.requests.length, 1); assert.equal(state.sales.length, 1); // D/I/J: no POST on reset.
  if (resolution === "next") await h.manual();
  await h.cart(); h.sale(() => bulkPost(request(h.requests.at(-1))));
  await h.page.handleRegisterWithdrawal(); await h.flush();
  assert.notEqual(h.requests[1].idempotencyKey, originalKey); // E: only this new intent creates K2.
  assert.equal(state.sales.length, 2); assert.equal(state.operations.length, 2);
  assert.equal(h.page.withdrawalFeedback.kind, "success");
}
console.log("PASS conflict A-E/I-J: synchronous block, edits stay blocked, explicit next/RFID reset, then new key; F-H covered above");
