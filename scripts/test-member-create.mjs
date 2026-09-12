// Actual route, normalizers, auth helper and page callbacks; simulated Prisma/React/HTTP.
// No database or credentials. Rollback/retry assertions do NOT prove PostgreSQL concurrency.
// Run: node scripts/test-member-create.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { Prisma } = require("@prisma/client");
const root = resolve(import.meta.dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
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
    vm.runInNewContext(code, {
      exports, require: load, console, Response, Request, SyntaxError, ...globals,
    }, { filename });
    return exports;
  }
  return load;
}
const unique = target => new Prisma.PrismaClientKnownRequestError("private database details", {
  code: "P2002", clientVersion: "7.8.0", meta: target === undefined ? {} : { target },
});
const minimum = { fullName: " Test Member ", dni: " ab-12.34 " };
function apiHarness(options = {}) {
  let members = [], audits = [];
  const calls = { transactions: 0, creates: 0, audits: 0, reads: 0, rollbacks: 0 };
  const prisma = {
    appUser: { async findUnique() {
      if (options.authError) throw options.authError;
      return { id: 1, active: options.active !== false, role: options.role ?? "ADMIN", name: "Operator", email: " OPERATOR@EXAMPLE.TEST " };
    } },
    // No global member/audit delegates: accidental writes outside tx fail tests.
    async $transaction(fn) {
      calls.transactions++;
      const pendingMembers = [...members], pendingAudits = [...audits];
      const tx = {
        member: {
          async findMany() {
            calls.reads++;
            if (options.readError) throw options.readError;
            return [...pendingMembers, ...(options.numbers ?? []).map(memberNumber => ({ memberNumber }))];
          },
          async create({ data }) {
            calls.creates++;
            const error = options.memberError?.(calls.creates);
            if (error) throw error;
            for (const field of ["dni", "memberNumber", "rfidCode"]) {
              if (data[field] != null && pendingMembers.some(member => member[field] === data[field])) throw unique([field]);
            }
            const member = {
              id: pendingMembers.length + 1, phone: null, email: null, active: true,
              expiresAt: null, rfidCode: null, commercialProfile: "STANDARD", discountPercent: 0,
              commercialNotes: null, photoUrl: null, dniFrontUrl: null, dniBackUrl: null,
              joinedAt: "2026-09-12T00:00:00.000Z", createdAt: "2026-09-12T00:00:00.000Z",
              ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
            };
            pendingMembers.push(member);
            return member;
          },
        },
        auditLog: { async create({ data }) {
          calls.audits++;
          assert.equal(pendingMembers.length, members.length + 1, "Member staged before audit");
          if (options.auditError) throw options.auditError;
          pendingAudits.push(data);
          return data;
        } },
      };
      try {
        const result = await fn(tx);
        if (options.commitError) throw options.commitError;
        members = pendingMembers; audits = pendingAudits;
        return result;
      } catch (error) { calls.rollbacks++; throw error; }
    },
  };
  const load = loader({
    "@/lib/prisma": { prisma }, "@/lib/auth": { authConfig: {} },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "1", role: "STALE" } } },
    "next/server": { NextResponse: Response },
  });
  const { POST } = load("@/app/api/members/route");
  return {
    calls, get members() { return plain(members); }, get audits() { return plain(audits); },
    async post(body = minimum) {
      const response = await POST(new Request("http://localhost/api/members", {
        method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    },
    POST,
  };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
function empty(h) { assert.equal(h.members.length, 0); assert.equal(h.audits.length, 0); }
function committed(h) { assert.equal(h.members.length, 1); assert.equal(h.audits.length, 1); }

await test("A/C/G: minimal automatic create, canonical DNI and omitted RFID", async () => {
  const h = apiHarness(); const result = await h.post();
  assert.equal(result.status, 200); committed(h);
  assert.equal(result.body.fullName, "Test Member"); assert.equal(result.body.dni, "AB1234");
  assert.equal(result.body.memberNumber, "1"); assert.equal(result.body.rfidCode, null);
  assert.equal(h.calls.reads, 1); assert.equal(h.calls.transactions, 1);
  assert.deepEqual(result.body, h.members[0]);
});
await test("B: explicit number keeps syntax and bypasses algorithm", async () => {
  const h = apiHarness(); const r = await h.post({ ...minimum, memberNumber: "  X-001  " });
  assert.equal(r.status, 200); assert.equal(r.body.memberNumber, "X-001");
  assert.equal(h.calls.reads, 0); assert.equal(h.calls.transactions, 1); committed(h);
});
await test("C: existing automatic number algorithm preserved", async () => {
  const h = apiHarness({ numbers: [null, "007", "3", "X9", "9007199254740992"] });
  assert.equal((await h.post()).body.memberNumber, "8");
});
for (const [label, field, code] of [
  ["D/AI", "dni", "DNI_ALREADY_EXISTS"], ["E", "memberNumber", "MEMBER_NUMBER_ALREADY_EXISTS"],
  ["F/AJ", "rfidCode", "RFID_ALREADY_ASSIGNED"],
]) {
  for (const target of [[field], field, `Member_${field}_key`]) {
    await test(`${label}: exact unique target ${JSON.stringify(target)}`, async () => {
      const h = apiHarness({ memberError: () => unique(target) });
      const r = await h.post({ ...minimum, ...(field === "memberNumber" ? { memberNumber: "42" } : {}) });
      assert.equal(r.status, 409); assert.equal(r.body.code, code); empty(h);
      assert.equal(h.calls.transactions, 1); assert.equal(h.calls.audits, 0);
    });
  }
}
await test("D: equivalent canonical DNI conflicts on manual resubmit", async () => {
  const h = apiHarness(); await h.post();
  const r = await h.post({ ...minimum, dni: "AB1234" });
  assert.equal(r.status, 409); assert.equal(r.body.code, "DNI_ALREADY_EXISTS"); committed(h);
});
for (const [label, value] of [["H", null], ["RFID normalization", " A B\n\u0001C "]]) {
  await test(label, async () => {
    const h = apiHarness(); const r = await h.post({ ...minimum, rfidCode: value });
    assert.equal(r.status, 200); assert.equal(r.body.rfidCode, value === null ? null : "ABC"); committed(h);
  });
}
for (const value of ["", " \n\u0001", 123]) await test(`I: invalid RFID ${JSON.stringify(value)}`, async () => {
  const h = apiHarness(); assert.equal((await h.post({ ...minimum, rfidCode: value })).status, 400); empty(h);
});
for (const explicit of [false, true]) {
  for (const error of [new Error("private audit failure"), unique(["memberNumber"]), unique(["dni"]), unique(["rfidCode"])]) {
    await test(`J/N/AG/AH: audit rollback ${explicit ? "explicit" : "automatic"} ${error.code ?? "unknown"}`, async () => {
      const h = apiHarness({ auditError: error });
      const r = await h.post({ ...minimum, ...(explicit ? { memberNumber: "42" } : {}) });
      assert.equal(r.status, 500); assert.deepEqual(r.body, { error: "No se pudo crear el socio." });
      empty(h); assert.equal(h.calls.transactions, 1); assert.equal(h.calls.rollbacks, 1);
    });
  }
}
await test("K: Member infrastructure failure", async () => {
  const h = apiHarness({ memberError: () => new Error("connection details") });
  assert.equal((await h.post()).status, 500); empty(h); assert.equal(h.calls.audits, 0);
});
await test("L: automatic unique retries whole transaction", async () => {
  const h = apiHarness({ memberError: attempt => attempt < 3 ? unique(["memberNumber"]) : null });
  assert.equal((await h.post()).status, 200); committed(h);
  assert.equal(h.calls.transactions, 3); assert.equal(h.calls.reads, 3);
  assert.equal(h.calls.rollbacks, 2); assert.equal(h.calls.audits, 1);
});
await test("M: exactly five number conflicts", async () => {
  const h = apiHarness({ memberError: () => unique(["memberNumber"]) });
  const r = await h.post(); assert.equal(r.status, 409);
  assert.equal(r.body.code, "MEMBER_NUMBER_GENERATION_CONFLICT");
  assert.equal(h.calls.transactions, 5); assert.equal(h.calls.rollbacks, 5); empty(h);
});
for (const target of [undefined, ["id"], "other_memberNumber_key", ["dni", "memberNumber"]]) {
  await test(`O: unrecognized unique ${JSON.stringify(target)}`, async () => {
    const h = apiHarness({ memberError: () => unique(target) });
    assert.equal((await h.post()).status, 500); assert.equal(h.calls.transactions, 1); empty(h);
  });
}
for (const [label, value] of [["P", null], ["Q", ""], ["valid date", "2027-01-01"]]) {
  await test(`${label}: expiry`, async () => {
    const h = apiHarness(); const r = await h.post({ ...minimum, expiresAt: value });
    assert.equal(r.status, 200); assert.equal(r.body.expiresAt, value ? "2027-01-01T00:00:00.000Z" : null);
  });
}
await test("R: invalid date before writes", async () => {
  const h = apiHarness(); assert.equal((await h.post({ ...minimum, expiresAt: "not-a-date" })).status, 400); empty(h);
});
await test("S: malformed JSON", async () => {
  const h = apiHarness(); const r = await h.post("{");
  assert.equal(r.status, 400); assert.equal(r.body.code, "INVALID_PAYLOAD"); empty(h);
});
for (const field of ["active", "commercialProfile", "discountPercent", "commercialNotes"]) {
  await test(`U: STAFF forbidden ${field}`, async () => {
    const values = { active: false, commercialProfile: "VIP", discountPercent: 5, commercialNotes: "note" };
    const h = apiHarness({ role: "STAFF" });
    assert.equal((await h.post({ ...minimum, [field]: values[field] })).status, 403); empty(h);
  });
}
await test("T/V: persisted STAFF and ADMIN authority", async () => {
  const staff = apiHarness({ role: "STAFF" }); assert.equal((await staff.post()).status, 200);
  const admin = apiHarness(); const r = await admin.post({ ...minimum, active: false, discountPercent: 5, commercialProfile: "VIP", commercialNotes: "note" });
  assert.equal(r.status, 200); assert.equal(r.body.active, false); assert.equal(r.body.discountPercent, 5);
});
for (const [label, options, status] of [["W", { noSession: true }, 401], ["X", { role: "MEMBER" }, 403], ["inactive stale session", { active: false }, 401]]) {
  await test(label, async () => {
    const h = apiHarness(options); assert.equal((await h.post()).status, status); empty(h);
  });
}
for (const key of ["authError", "readError", "commitError"]) await test(`${key}: infrastructure stays 500`, async () => {
  const h = apiHarness({ [key]: unique(["memberNumber"]) });
  assert.equal((await h.post()).status, 500); empty(h); assert.ok(h.calls.transactions <= 1);
});
await test("body transport failure stays 500", async () => {
  const h = apiHarness(); const r = await h.POST({ json: async () => { throw new Error("transport"); } });
  assert.equal(r.status, 500); empty(h);
});
await test("AF: exact minimal audit and operator attribution", async () => {
  const h = apiHarness(); const r = await h.post({ ...minimum, phone: "PRIVATE_PHONE", email: "PRIVATE_EMAIL", rfidCode: "PRIVATE_RFID" });
  assert.equal(r.status, 200);
  assert.deepEqual(h.audits[0], {
    actorUserId: 1, actorEmail: "operator@example.test", action: "MEMBER_CREATED", entityType: "Member", entityId: "1",
    summary: "Socio creado #1", metadata: { memberNumber: "1", active: true, hasExpiration: false, hasRfid: true },
  });
  for (const value of ["AB1234", "PRIVATE_PHONE", "PRIVATE_EMAIL", "PRIVATE_RFID"]) assert.ok(!JSON.stringify(h.audits).includes(value));
});
await test("audit preserves existing truncation without truncating Member", async () => {
  const h = apiHarness(); const r = await h.post({ ...minimum, memberNumber: "X".repeat(600) });
  assert.equal(r.body.memberNumber.length, 600);
  assert.equal(h.audits[0].summary.length, 500); assert.equal(h.audits[0].metadata.memberNumber.length, 500);
});
await test("unchanged permissive contracts and unknown fields", async () => {
  const h = apiHarness(); const r = await h.post({ ...minimum, active: "false", email: "not-email", phone: "free", commercialProfile: "", extra: "ignored" });
  assert.equal(r.status, 200); assert.equal(r.body.active, true); assert.equal(r.body.email, "not-email");
  assert.equal(r.body.commercialProfile, ""); assert.ok(!("extra" in r.body));
  for (const body of [{ name: "wrong", dni: "1" }, { ...minimum, memberNumber: null }, { ...minimum, memberNumber: " " }, { ...minimum, dni: "" }]) {
    assert.equal((await h.post(body)).status, 400);
  }
});

// Page harness renders actual JSX with persistent hook slots. Effects are not run:
// mount reads, scanner focus and signing polling are outside CREATE's scope.
function pageHarness(path) {
  const slots = []; let cursor = 0, tree;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {},
  };
  const requests = []; let reply = async () => Response.json({});
  let refresh = async () => Response.json([]);
  const jsx = (type, props) => ({ type, props });
  const load = loader({
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "a" },
    "@/components/ui/page-header": { PageHeader: "header" },
  }, { fetch: async (url, options = {}) => {
    requests.push({ url, ...options });
    return options.method === "POST" ? reply(url, options) : refresh();
  } });
  const Page = load(path).default;
  function render() { cursor = 0; tree = Page(); }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap(item => nodes(item));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node = tree) {
    if (Array.isArray(node)) return node.map(item => text(item)).join(" ");
    if (node && typeof node === "object") return text(node.props?.children ?? null);
    return typeof node === "string" || typeof node === "number" ? String(node) : "";
  }
  render();
  return {
    render, requests, nodes, text,
    reply(fn) { reply = fn; }, refresh(fn) { refresh = fn; },
    form() { return nodes().find(node => node.type === "form"); },
    submit() { return this.form().props.onSubmit({ preventDefault() {} }); },
    field(label) { return nodes(nodes().find(node => node.type === "label" && text(node).includes(label))).find(node => node.type === "input"); },
    fill(label, value) { this.field(label).props.onChange({ target: { value } }); render(); },
    button() { return nodes().find(node => node.type === "button" && node.props.type === "submit"); },
    postCount() { return requests.filter(request => request.method === "POST").length; },
  };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const created = (await apiHarness().post()).body;
for (const path of ["@/app/members/page", "@/app/members/new/page"]) {
  const quick = path === "@/app/members/page";
  function setup() {
    const h = pageHarness(path); h.fill("Nombre completo", "Test Member"); h.fill("DNI", "AB1234"); return h;
  }
  await test(`${quick ? "Y" : "Z"}: same-render double submit and pending JSON ${path}`, async () => {
    const h = setup(); const pending = deferred();
    h.reply(async () => ({ ok: true, json: () => pending.promise }));
    const submit = h.form().props.onSubmit;
    const first = submit({ preventDefault() {} }); await submit({ preventDefault() {} });
    await Promise.resolve(); h.render();
    assert.equal(h.postCount(), 1); assert.equal(h.button().props.disabled, true);
    pending.resolve(created); await first; h.render();
    assert.equal(h.postCount(), 1);
    if (quick) assert.equal(h.field("Nombre completo").props.value, "");
    else assert.ok(!h.form());
  });
  for (const status of [400, 401, 403, 409, 500]) await test(`AA: known HTTP ${status} retains form ${path}`, async () => {
    const h = setup(); h.reply(async () => Response.json({ error: "Server rejection" }, { status }));
    await h.submit(); h.render();
    assert.equal(h.field("DNI").props.value, "AB1234"); assert.equal(h.button().props.disabled, false);
    assert.ok(h.text().includes("Server rejection")); assert.equal(h.requests.length, 1);
  });
  for (const mode of ["network", "timeout", "json", "shape", "error-json"]) await test(`AB/AE: uncertain ${mode}, guard released ${path}`, async () => {
    const h = setup(); h.reply(async () => {
      if (mode === "network" || mode === "timeout") throw new Error(mode);
      if (mode === "shape") return Response.json({ id: 1 });
      return new Response("unreadable", { status: mode === "error-json" ? 502 : 200 });
    });
    await h.submit(); h.render();
    assert.equal(h.field("DNI").props.value, "AB1234"); assert.equal(h.button().props.disabled, false);
    assert.ok(h.text().includes("Resultado sin confirmar")); assert.equal(h.requests.length, 1);
    // Explicit manual retry works; no retry was sent before this call.
    h.reply(async () => Response.json(created)); await h.submit(); h.render(); assert.equal(h.postCount(), 2);
  });
  await test(`${quick ? "AC" : "AD"}: valid success ${path}`, async () => {
    const h = setup(); h.reply(async () => Response.json(created)); await h.submit(); h.render();
    if (quick) {
      assert.equal(h.field("Nombre completo").props.value, "");
      assert.equal(h.requests.filter(request => !request.method).length, 1);
    } else {
      assert.ok(!h.form()); assert.ok(h.text().includes("Test Member")); assert.equal(h.requests.length, 1);
      assert.ok(h.text().includes("AB1234"));
    }
  });
  await test(`AE: committed POST response lost, manual retry is DNI conflict ${path}`, async () => {
    const h = setup(); const api = apiHarness();
    h.reply(async (_url, options) => {
      assert.equal((await api.post(JSON.parse(options.body))).status, 200);
      throw new Error("response lost after commit");
    });
    await h.submit(); h.render(); committed(api);
    assert.equal(h.field("DNI").props.value, "AB1234"); assert.ok(h.text().includes("Resultado sin confirmar"));
    assert.equal(h.postCount(), 1);
    h.reply(async (_url, options) => {
      const result = await api.post(JSON.parse(options.body));
      assert.equal(result.body.code, "DNI_ALREADY_EXISTS");
      return Response.json(result.body, { status: result.status });
    });
    await h.submit(); h.render(); committed(api);
    assert.ok(h.text().includes("El DNI ya existe")); assert.equal(h.postCount(), 2);
  });
}
await test("confirmed quick create with refresh failure remains confirmed", async () => {
  const h = pageHarness("@/app/members/page"); h.fill("Nombre completo", "Test"); h.fill("DNI", "1");
  h.reply(async () => Response.json(created)); h.refresh(async () => Response.json({}, { status: 500 }));
  await h.submit(); h.render(); assert.ok(h.text().includes("Socio creado. No se pudo actualizar"));
  assert.ok(!h.text().includes("Resultado sin confirmar")); assert.equal(h.field("DNI").props.value, "");
});
console.log(`${checks} focused checks passed. Simulated transactions; PostgreSQL concurrency not exercised.`);
