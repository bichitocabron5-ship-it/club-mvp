// Real lifecycle/core and routes; serialized transactional doubles, NOT PostgreSQL concurrency.
import assert from "node:assert/strict";
import { loader, harness, snapshotId } from "./test-public-signing-identity.mjs";

const actor = { id: 7, email: "staff@example.invalid" };
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
const clone = structuredClone;
function lifecycleHarness(options = {}) {
  let state = { sessions: clone(options.sessions ?? []), audits: [] };
  let nextId = 100, tail = Promise.resolve();
  const now = new Date();
  const prisma = { async $transaction(run) {
    const wait = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await wait;
    const staged = clone(state);
    let memberLocked = false, sessionLocked = false;
    const tx = {
      async $queryRaw(strings, ...values) {
        const sql = strings.join("?");
        if (sql.includes('FROM "Member"')) {
          assert.match(sql, /FOR UPDATE/); memberLocked = true;
          return options.missingMember ? [] : [{ id: values[0] }];
        }
        assert.ok(memberLocked, "Member lock precedes all lifecycle operations");
        if (sql.includes('FROM "ContractTemplate"')) {
          assert.match(sql, /FOR SHARE/);
          return [{ id: values[0], documentSnapshotId: options.changedSnapshot ? "changed" : snapshotId }];
        }
        if (sql.includes('FROM "SigningSession"') && sql.includes('FOR UPDATE')) {
          sessionLocked = true; return [{ id: values[0] }];
        }
        if (sql.includes('UPDATE "SigningSession"') && sql.includes("'CANCELLED'")) {
          assert.match(sql, /"status" = 'PENDING'/);
          const rows = staged.sessions.filter(s => s.memberId === values[0] && s.status === "PENDING");
          rows.forEach(s => { s.status = "CANCELLED"; }); return rows.map(s => ({ id: s.id }));
        }
        if (sql.includes('UPDATE "SigningSession"')) {
          assert.ok(sessionLocked); assert.match(sql, /"expiresAt" > clock_timestamp\(\)/);
          const [signatureImage, id, memberId, templateId, documentSnapshotId] = values;
          const row = staged.sessions.find(s => s.id === id && s.memberId === memberId && s.status === "PENDING" && s.contractTemplateId === templateId && s.documentSnapshotId === documentSnapshotId && s.expiresAt > now);
          if (!row) return [];
          Object.assign(row, { status: "SIGNED", signatureImage, signedAt: now }); return [{ id }];
        }
        if (sql.includes('FROM "SigningSession"')) return staged.sessions.filter(s => s.id === values[0] && s.expiresAt <= now).map(s => ({ id: s.id }));
        assert.match(sql, /SELECT clock_timestamp\(\)/); return [{ now }];
      },
      signingSession: {
        async create({ data }) { assert.ok(memberLocked); const row = { id: nextId++, status: "PENDING", ...clone(data) }; staged.sessions.push(row); return clone(row); },
        async findUnique({ where }) { return clone(staged.sessions.find(s => s.id === where.id) ?? null); },
        async updateMany({ where, data }) {
          assert.ok(memberLocked);
          const rows = staged.sessions.filter(s => s.id === where.id && s.memberId === where.memberId && s.status === where.status);
          rows.forEach(s => Object.assign(s, data)); return { count: rows.length };
        },
      },
      auditLog: { async create({ data }) {
        if (options.failAudit) throw new Error("audit unavailable");
        staged.audits.push(clone(data)); return data;
      } },
    };
    try { const result = await run(tx); state = staged; return result; } finally { release(); }
  } };
  const load = loader({
    "@/lib/prisma": { prisma },
    "@/lib/storage": {},
    "@/lib/supabase-admin": {},
    "@/lib/signing-session": { SIGNING_SESSION_TTL_HOURS: 24 },
    "@/lib/auth-server": { requireStaffOrAdmin: async () => options.denied ? { ok: false, status: 403, error: "FORBIDDEN" } : { ok: true, session: { user: { id: String(actor.id), email: actor.email } } } },
    "next/server": { NextResponse: Response },
  });
  const core = load("@/lib/signing-session-lifecycle");
  const cancelRoute = load("@/app/api/members/[id]/signing-sessions/[sessionId]/cancel/route").POST;
  return {
    get state() { return state; },
    create: () => core.createOrReissueSigningSession({ memberId: 17, templateId: 3, documentSnapshotId: snapshotId, actor }),
    cancel: id => core.cancelSigningSession(17, id, actor),
    claim: id => prisma.$transaction(tx => core.claimSigningSession(tx, { id, memberId: 17, templateId: 3, documentSnapshotId: snapshotId, signatureImage: "private-signature" })),
    cancelRoute: (id, memberId = "17") => cancelRoute(new Request("https://test/cancel", { method: "POST" }), { params: Promise.resolve({ id: memberId, sessionId: String(id) }) }),
  };
}
const pending = (id, extra = {}) => ({ id, memberId: 17, status: "PENDING", token: `old-token-${id}`, contractTemplateId: 3, documentSnapshotId: snapshotId, expiresAt: new Date(Date.now() + 3600_000), ...extra });

await test("creation: DB TTL, provenance, actor and minimal token-free audit", async () => {
  const h = lifecycleHarness(); const row = await h.create();
  assert.match(row.token, /^[a-f0-9]{48}$/); assert.equal(row.documentSnapshotId, snapshotId); assert.equal(row.contractTemplateId, 3);
  assert.ok(row.expiresAt > new Date()); assert.equal(h.state.audits.length, 1);
  const event = h.state.audits[0]; assert.equal(event.action, "SIGNING_SESSION_CREATED");
  assert.equal(event.actorUserId, 7); assert.equal(event.actorEmail, actor.email);
  assert.deepEqual(event.metadata, { memberId: 17, signingSessionId: row.id, reason: "NEW_LINK" });
  assert.ok(!JSON.stringify(event).includes(row.token));
});
for (const count of [1, 3]) await test(`reissue cancels ${count} legacy pending, preserves signed/cancelled/other member`, async () => {
  const history = [pending(20, { status: "SIGNED" }), pending(21, { status: "CANCELLED" }), pending(22, { memberId: 18 })];
  const h = lifecycleHarness({ sessions: [...Array.from({ length: count }, (_, i) => pending(i + 1)), ...history] });
  const row = await h.create();
  assert.equal(h.state.sessions.filter(s => s.memberId === 17 && s.status === "PENDING").length, 1);
  for (let i = 1; i <= count; i++) {
    assert.equal(h.state.sessions.find(s => s.id === i).status, "CANCELLED");
    assert.notEqual(row.token, `old-token-${i}`);
    assert.equal(h.state.audits.find(a => a.entityId === String(i)).metadata.replacementSigningSessionId, row.id);
  }
  assert.deepEqual(h.state.sessions.filter(s => [20, 21, 22].includes(s.id)), history);
});
await test("cancel endpoint is idempotent, scoped to member, and audited by operator", async () => {
  const h = lifecycleHarness({ sessions: [pending(1)] });
  assert.equal((await h.cancelRoute(1, "18")).status, 404);
  assert.equal((await h.cancelRoute(1)).status, 200); assert.equal((await h.cancelRoute(1)).status, 200);
  assert.equal(h.state.audits.length, 1); assert.equal(h.state.audits[0].actorUserId, 7);
  assert.equal(h.state.sessions[0].token, "old-token-1");
  assert.equal((await h.cancelRoute(1, "invalid")).status, 400);
  assert.equal((await lifecycleHarness({ denied: true }).cancelRoute(1)).status, 403);
});
await test("signed cannot cancel; cancelled cannot claim", async () => {
  const h = lifecycleHarness({ sessions: [pending(1, { status: "SIGNED" }), pending(2, { status: "CANCELLED" })] });
  assert.equal((await h.cancelRoute(1)).status, 409); assert.equal((await h.claim(2)).count, 0); assert.equal(h.state.audits.length, 0);
});
for (const status of ["CANCELLED", "PENDING"]) await test(`new token after ${status}/expiry preserves history`, async () => {
  const h = lifecycleHarness({ sessions: [pending(1, { status, expiresAt: new Date(0) })] });
  const row = await h.create(); assert.notEqual(row.token, h.state.sessions[0].token);
  assert.equal(h.state.sessions[0].status, "CANCELLED"); assert.equal(h.state.sessions.length, 2);
});
for (const operation of ["create", "cancel"]) await test(`audit failure rolls back ${operation}`, async () => {
  const h = lifecycleHarness({ sessions: [pending(1)], failAudit: true }); const before = clone(h.state);
  await assert.rejects(operation === "create" ? h.create() : h.cancel(1)); assert.deepEqual(h.state, before);
});
await test("template race and deleted member leave pending untouched", async () => {
  for (const options of [{ changedSnapshot: true }, { missingMember: true }]) {
    const h = lifecycleHarness({ ...options, sessions: [pending(1)] }); const before = clone(h.state);
    await assert.rejects(h.create()); assert.deepEqual(h.state, before);
  }
});
await test("two simultaneous reissues: serialized double leaves one pending and fresh tokens", async () => {
  const h = lifecycleHarness(); const rows = await Promise.all([h.create(), h.create()]);
  assert.notEqual(rows[0].token, rows[1].token);
  assert.equal(h.state.sessions.filter(s => s.status === "PENDING").length, 1);
  assert.equal(h.state.audits.filter(a => a.action === "SIGNING_SESSION_CREATED").length, 2);
});
for (const operation of ["cancel", "create"]) {
  for (const first of ["sign", "admin"]) await test(`${operation} vs signature, ${first} wins (serialized double)`, async () => {
    const h = lifecycleHarness({ sessions: [pending(1)] });
    const admin = () => operation === "cancel" ? h.cancel(1) : h.create();
    const results = await Promise.allSettled(first === "sign" ? [h.claim(1), admin()] : [admin(), h.claim(1)]);
    assert.equal(h.state.sessions[0].status, first === "sign" ? "SIGNED" : "CANCELLED");
    if (first === "admin") assert.equal(results[1].value.count, 0);
    if (first === "sign" && operation === "cancel") assert.equal(results[1].status, "rejected");
  });
}
await test("public POST expiration between preflight and claim is 410 and writes nothing", async () => {
  const h = harness({ beforeClaim: state => { state.session.expiresAt = new Date(0); } });
  assert.equal((await h.post()).status, 410); assert.equal(h.state.session.status, "PENDING"); assert.equal(h.state.contracts.length, 0); assert.equal(h.state.audits.length, 0);
});
await test("public cancelled session rejects before and after preflight", async () => {
  for (const options of [{ status: "CANCELLED" }, { beforeClaim: state => { state.session.status = "CANCELLED"; } }]) {
    const h = harness(options); assert.equal((await h.post()).status, 409); assert.equal(h.state.contracts.length, 0);
  }
});
await test("signed replay remains immutable; expired signed token returns 410", async () => {
  const h = harness(); assert.equal((await h.post()).status, 200);
  const before = clone(h.state); assert.equal((await h.post({ fullName: "different" })).status, 200); assert.deepEqual(h.state, before);
  h.setExpiresAt(new Date(0));
  assert.equal((await h.post()).status, 410); assert.equal((await h.get()).status, 410);
});
console.log(`${checks} lifecycle checks passed; transactional doubles, no PostgreSQL concurrency claim.`);
