// Real routes/auth; in-memory Prisma and Storage doubles. No database/network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const signatureImage = "data:image/png;base64,PRIVATE_SIGNATURE_BYTES";
const template = { id: 3, name: "Original", version: "1", active: true,
  createdAt: "2026-09-01T00:00:00.000Z", fileUrl: "private-template" };
const contract = { id: 41, memberId: 17, signingSessionId: 9, contractTemplateId: 3,
  fullName: "Contract name", dni: "DOC", address: "Address", birthPlace: "Place",
  birthDate: "1990-01-01T00:00:00.000Z", phone: "111", email: "test@example.invalid",
  consumptionGrams: 42, signedAt: "2026-09-01T00:00:00.000Z", signedPdfUrl: "private-pdf" };
const member = { id: 17, fullName: "Member", dni: "DOC", photoUrl: null, dniFrontUrl: null, dniBackUrl: null };
function harness(options = {}) {
  let reads = 0;
  const resolvedRefs = [];
  const memberReads = [];
  const saleReads = [];
  const downloads = [];
  let authReads = 0;
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => options.noSession ? null : { user: { id: "1", role: options.jwtRole ?? "ADMIN" } } },
    "@/lib/auth": { authConfig: {} },
    "@/lib/contract-storage": { createSignedUrlForAllowedStorageRef: async ref => ref ? options.contracts ? `https://storage.invalid/${ref}` : "https://storage.invalid/pdf" : null },
    "@/lib/storage": { STORAGE_BUCKET: "club-uploads",
      parseStorageUrl: ref => ref ? { bucket: ref.split("/")[0], path: ref.split("/").slice(1).join("/") } : null,
      isStorageUrlsDisabled: () => false, resolveStorageUrlForResponse: async ref => {
      resolvedRefs.push(ref);
      return ref ? `https://storage.invalid/${ref}` : null;
    } },
    "@/lib/supabase-admin": { getSupabaseAdmin: () => ({ storage: { from: bucket => ({
      download: async path => {
        downloads.push(`${bucket}/${path}`);
        return { data: new Blob([path], { type: "application/pdf" }), error: null };
      },
    }) } }) },
    "@/lib/audit": {},
    "@/lib/contract-pdf": { ContractPdfError: class extends Error {} },
    "@/lib/prisma": { prisma: {
      memberDocument: { findFirst: async () => null },
      appUser: { findUnique: async query => {
        authReads++;
        assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { id: 1 });
        return options.missingUser ? null : { id: 1, active: options.active ?? true, role: options.role ?? "STAFF" };
      } },
      memberContract: { findFirst: async () => null, findMany: async query => {
        reads++;
        assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { memberId: 17 });
        assert.deepEqual(JSON.parse(JSON.stringify(query.orderBy)), [{ signedAt: "desc" }, { id: "desc" }]);
        assert.ok(query.select && !query.select.signatureImage, "query excludes raw signature");
        if (options.contracts) return options.contracts.filter(c => c.memberId === query.where.memberId).slice().sort((a, b) => {
          for (const clause of query.orderBy) {
            const [field, direction] = Object.entries(clause)[0];
            const delta = field === "signedAt" ? new Date(a[field]) - new Date(b[field]) : a[field] - b[field];
            if (delta) return direction === "desc" ? -delta : delta;
          }
          return 0;
        });
        // Deliberately return extra sensitive fields: DTO must also be an allowlist.
        return options.empty ? [] : [{ ...contract, signatureImage, futureSignature: signatureImage,
          ...(options.legacy ? { signedPdfUrl: null, contractTemplateId: null, signingSessionId: null } : {}),
          contractTemplate: options.legacy ? null : template }];
      } },
      member: { findUnique: async query => {
        reads++;
        memberReads.push(query.where.id);
        return options.members ? options.members.find(row => row.id === query.where.id) ?? null : member;
      } },
      sale: { findMany: async query => { saleReads.push(query.where.memberId); return []; } },
    } },
  };
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) return require(name);
    if (cache.has(name)) return cache.get(name);
    const filename = resolve(root, name.slice(2) + ".ts");
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, require: load, Response, Request, URL, console }, { filename });
    return exports;
  }
  return {
    get: (route, id = "17") => load(`@/app/api/members/[id]/${route}/route`).GET(
      new Request(`http://test/api/members/${id}/${route}`), { params: Promise.resolve({ id }) }),
    call: (route, method, id, query = "side=front") => load(`@/app/api/${route}/route`)[method](
      new Request(`http://test/api/test?${query}`, { method }), { params: Promise.resolve({ id }) }),
    reads: () => reads,
    resolvedRefs, memberReads, saleReads, downloads,
    authReads: () => authReads,
  };
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
await test("operational status never discloses legacy DNI references to an active non-staff user", async () => {
  const h = harness({ role: "MEMBER", members: [{ ...member, active: true, expiresAt: null, rfidCode: null,
    dniFrontUrl: "https://storage.invalid/front?token=PRIVATE_DNI",
    dniBackUrl: "member-documents/members/17/dni-back.pdf",
  }] });
  const response = await h.get("operational-status");
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.deepEqual(body, { error: "FORBIDDEN" });
  assert.equal(h.reads(), 0);
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_DNI|member-documents|storage.invalid/);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
});
async function safeBody(response) {
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.doesNotMatch(text, /signatureImage|PRIVATE_SIGNATURE_BYTES|data:image/);
  return JSON.parse(text);
}
for (const role of ["STAFF", "ADMIN"]) {
  await test(`${role}: contractual metadata preserved without signature`, async () => {
    const body = await safeBody(await harness({ role }).get("contracts"));
    assert.equal(Object.hasOwn(body[0], "signatureImage"), false);
    assert.deepEqual(body, [{ ...contract, signedPdfUrl: "https://storage.invalid/pdf",
      contractTemplate: { ...template, fileUrl: null } }]);
  });
  await test(`${role}: history remains free of signature`, async () => {
    assert.deepEqual(await safeBody(await harness({ role }).get("history")), {
      member, sales: [], totalSpent: 0, count: 0,
    });
  });
}
for (const [options, status] of [[{ noSession: true }, 401], [{ active: false }, 401], [{ role: "OTHER" }, 403]]) {
  await test(`contracts rejects ${JSON.stringify(options)}`, async () => {
    const h = harness(options), response = await h.get("contracts");
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
    assert.equal(h.reads(), 0);
  });
}
await test("empty and legacy contracts preserve HTTP shape", async () => {
  assert.deepEqual(await safeBody(await harness({ empty: true }).get("contracts")), []);
  assert.deepEqual(await safeBody(await harness({ legacy: true }).get("contracts")), [{
    ...contract, signingSessionId: null, contractTemplateId: null, signedPdfUrl: null, contractTemplate: null,
  }]);
});
await test("tied history preserves each identity, PDF and legacy null without inferring provenance", async () => {
  const contracts = [
    { ...contract, signedPdfUrl: "contracts/41.pdf", documentSnapshotId: "snapshot", contractTemplate: template },
    { ...contract, id: 42, fullName: "Legacy name", signingSessionId: null, contractTemplateId: null,
      documentSnapshotId: null, consumptionGrams: null, signedPdfUrl: "contracts/42.pdf", contractTemplate: null },
  ];
  const before = structuredClone(contracts);
  for (const input of [contracts, contracts.slice().reverse()]) {
    const body = await safeBody(await harness({ contracts: input }).get("contracts"));
    assert.deepEqual(body, [contracts[1], contracts[0]].map(source => {
      const row = { ...source };
      delete row.documentSnapshotId;
      return { ...row, signedPdfUrl: `https://storage.invalid/${row.signedPdfUrl}`,
        contractTemplate: row.contractTemplate ? { ...row.contractTemplate, fileUrl: null } : null };
    }));
  }
  assert.deepEqual(contracts, before);
});
// Administrative document authorization uses the real persisted-user helper.
const documentRoutes = [
  ["members/[id]/history", "GET"], ["members/[id]/dni", "POST"],
  ["members/[id]/documents", "GET"], ["members/[id]/documents", "POST"],
  ["members/[id]/photo", "POST"], ["members/[id]/contracts", "GET"],
  ["contracts/[id]/pdf", "GET"],
];
for (const [route, method] of documentRoutes) {
  for (const [options, status] of [
    [{ noSession: true }, 401], [{ missingUser: true }, 401],
    [{ active: false }, 401], [{ role: "MEMBER" }, 403], [{ role: "OTHER" }, 403],
  ]) {
    await test(`${method} ${route} rejects ${JSON.stringify(options)} before document lookup`, async () => {
      const h = harness(options);
      let expectedBody;
      for (const id of ["17", "999", "invalid"]) {
        const response = await h.call(route, method, id);
        assert.equal(response.status, status);
        const body = await response.json();
        assert.deepEqual(Object.keys(body), ["error"]);
        expectedBody ??= body;
        assert.deepEqual(body, expectedBody, "denial does not reveal existence or ID validity");
      }
      assert.equal(h.reads(), 0);
      assert.deepEqual(h.saleReads, []);
      assert.deepEqual(h.resolvedRefs, []);
      assert.deepEqual(h.downloads, []);
      assert.equal(h.authReads(), options.noSession ? 0 : 3);
    });
  }
}
for (const role of ["STAFF", "ADMIN"]) {
  await test(`history authorizes persisted ${role} despite a different JWT role; DTO and member isolation`, async () => {
    const members = [17, 18].map(id => ({ ...member, id,
      photoUrl: `club-uploads/members/${id}/profile.jpg`,
      dniFrontUrl: `member-documents/members/${id}/dni-front.pdf`,
      dniBackUrl: `member-documents/members/${id}/dni-back.png`,
    }));
    const h = harness({ role, jwtRole: "OTHER", members });
    for (const row of members) {
      assert.deepEqual(await safeBody(await h.get("history", String(row.id))), {
        member: { ...row, photoUrl: `https://storage.invalid/${row.photoUrl}`,
          dniFrontUrl: `/api/members/${row.id}/documents?side=front`,
          dniBackUrl: `/api/members/${row.id}/documents?side=back` },
        sales: [], totalSpent: 0, count: 0,
      });
    }
    assert.deepEqual(h.memberReads, [17, 18]);
    assert.deepEqual(h.saleReads, [17, 18]);
    assert.deepEqual(h.resolvedRefs, members.map(row => row.photoUrl));
    assert.equal(h.authReads(), 2);
  });
}
await test("history rejects invalid IDs before Prisma and returns 404 for absent member", async () => {
  const h = harness({ members: [] });
  for (const id of ["", "0", "-1", "1.5", "NaN", "Infinity", "2147483648", "9007199254740993", "1e2", " 17", "017"]) {
    assert.equal((await h.get("history", id)).status, 400);
  }
  assert.equal(h.reads(), 0);
  assert.equal((await h.get("history", "999")).status, 404);
  assert.deepEqual(h.memberReads, [999]);
  assert.deepEqual(h.saleReads, []);
  assert.deepEqual(h.resolvedRefs, []);
});
await test("history rechecks persisted authority on the next request", async () => {
  const options = { role: "ADMIN" };
  const h = harness(options);
  assert.equal((await h.get("history")).status, 200);
  options.role = "MEMBER";
  assert.equal((await h.get("history")).status, 403);
  options.role = "STAFF";
  options.active = false;
  assert.equal((await h.get("history")).status, 401);
  assert.equal(h.reads(), 1);
  assert.equal(h.authReads(), 3);
});
await test("DNI delivery selects only the route member and validated side, ignoring client references", async () => {
  const h = harness({ members: [17, 18].map(id => ({ ...member, id,
    dniFrontUrl: `member-documents/members/${id}/dni-front.pdf`,
    dniBackUrl: `member-documents/members/${id}/dni-back.pdf`,
  })) });
  for (const side of ["front", "back"]) {
    const response = await h.call("members/[id]/documents", "GET", "17",
      `side=${side}&memberId=18&path=members/18/dni-front.pdf&dniFrontUrl=member-documents/members/18/dni-front.pdf`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), `members/17/dni-${side}.pdf`);
  }
  assert.equal((await h.call("members/[id]/documents", "GET", "17", "side=../18/dni-front.pdf")).status, 400);
  assert.deepEqual(h.downloads, ["member-documents/members/17/dni-front.pdf", "member-documents/members/17/dni-back.pdf"]);
});
console.log(`${checks} contract minimization and document authorization checks passed`);
