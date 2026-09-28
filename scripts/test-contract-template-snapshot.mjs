// Real template writer, routes, Storage helper and snapshot helper; simulated infrastructure.
// Does not execute PostgreSQL or verify real database lock scheduling.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { loader } from './test-public-signing-identity.mjs';
const pdf = await PDFDocument.create();
for (let i = 0; i < 3; i++) pdf.addPage();
const bytes = Buffer.from(await pdf.save());
function harness(options = {}) {
  const templates = options.legacy ? [{ id: 1, active: true, documentSnapshotId: null }] : [];
  const snapshots = new Map();
  let transactions = 0, downloads = 0, updates = 0, locks = 0;
  let lockTail = Promise.resolve();
  const ordered = (rows, args) => {
    assert.deepEqual(JSON.parse(JSON.stringify(args.orderBy)), [{ createdAt: 'desc' }, { id: 'desc' }]);
    return [...rows].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0) || b.id - a.id);
  };
  const db = {
    contractDocumentSnapshot: {
      async findUnique({ where }) { assert.equal(transactions, 0); return snapshots.get(where.sha256) ?? null; },
      async create({ data }) {
        assert.equal(transactions, 0);
        if (options.snapshotFailure) throw new Error('snapshot failure');
        const row = { id: randomUUID(), capturedAt: new Date(), ...data };
        snapshots.set(row.sha256, row); return row;
      },
    },
    contractTemplate: {
      async findFirst(args) { return ordered(templates.filter(t => t.active), args)[0] ?? null; },
      async findMany(args) { return ordered(templates, args); },
    },
    async $transaction(run, settings) {
      assert.equal(settings.isolationLevel, 'ReadCommitted');
      await options.beforeTransaction?.();
      transactions++;
      let staged, release, locked = false;
      const rows = () => staged ??= structuredClone(templates);
      try {
        const result = await run({
          async $executeRaw(sql) {
            assert.equal(sql.join(''), 'SELECT pg_advisory_xact_lock(1129598288, 1)');
            const previous = lockTail;
            lockTail = new Promise(resolve => { release = resolve; });
            await previous;
            locked = true; locks++;
            await options.afterLock?.();
          },
          contractTemplate: {
            async findFirst(args) { assert.ok(locked); return ordered(rows().filter(t => t.active), args)[0] ?? null; },
            async updateMany(args) {
              assert.ok(locked); updates++;
              assert.deepEqual(JSON.parse(JSON.stringify(args)), { where: { active: true }, data: { active: false } });
              if (options.updateFailure) throw new Error('update failure');
              rows().filter(t => t.active).forEach(t => { t.active = false; });
            },
            async create({ data }) {
              if (data.active) assert.ok(locked);
              assert.ok(data.documentSnapshotId);
              if (options.templateFailure) throw new Error('insert failure');
              const row = { id: rows().length + 1, createdAt: new Date(), ...data }; rows().push(row); return row;
            },
          },
        });
        templates.splice(0, templates.length, ...rows()); return result;
      } finally { transactions--; release?.(); }
    },
  };
  const load = loader({
    'server-only': {}, 'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: db },
    '@/lib/auth-server': { requireAdmin: async () => options.denied ? { ok: false, status: 403, error: 'Forbidden' } : { ok: true } },
    '@/lib/storage': {
      isStorageUrlsDisabled: () => false,
      parseStorageUrl: value => value.startsWith('contract-templates/') ? { bucket: 'contract-templates', path: value.slice(19) } : null,
      buildStoredStorageRef: (bucket, path) => `${bucket}/${path}`,
      buildStoragePublicUrl: () => 'https://storage.invalid/template',
      createStorageSignedUrl: async () => 'https://storage.invalid/template',
    },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ storage: { from: () => ({
      list: async () => ({ data: [{ name: 'old.pdf', updated_at: '2020-01-01' }, { name: 'new.pdf', updated_at: '2026-09-25' }], error: null }),
      download: async (_path, _unused, settings) => {
        assert.equal(transactions, 0); assert.equal(settings.cache, 'no-store'); downloads++;
        if (options.storageFailure) return { error: new Error('private storage'), data: null };
        return { error: null, data: new Blob([options.invalidPdf ? 'invalid' : bytes]) };
      },
    }) } }) },
  });
  return {
    templates, snapshots, get downloads() { return downloads; }, get updates() { return updates; }, get locks() { return locks; },
    writer: load('@/lib/contract-templates'),
    get: () => load('@/app/api/contract-templates/route').GET(),
    post: (extra = {}) => load('@/app/api/contract-templates/route').POST(new Request('https://club.invalid/api/contract-templates', {
      method: 'POST', body: JSON.stringify({ name: 'Admin', version: '1', fileUrl: 'contract-templates/admin.pdf', ...extra }),
    })),
  };
}
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
await test('admin and bootstrap capture identical bytes through one writer and deduplicate', async () => {
  const h = harness();
  const response = await h.post({ active: false, documentSnapshotId: 'client-forged' });
  assert.equal(response.status, 200);
  const admin = await response.json();
  const imported = await h.writer.findActiveContractTemplate();
  assert.equal(imported.fileUrl, 'contract-templates/new.pdf');
  assert.equal(imported.documentSnapshotId, admin.documentSnapshotId);
  assert.notEqual(admin.documentSnapshotId, 'client-forged');
  assert.equal(admin.active, false); assert.equal(imported.active, true);
  assert.equal(h.snapshots.size, 1); assert.equal(h.downloads, 2); assert.equal(h.updates, 1);
  assert.deepEqual([...h.snapshots.values()][0].bytes, bytes);
});
for (const options of [{ storageFailure: true }, { invalidPdf: true }, { snapshotFailure: true }]) {
  await test(`both entry points reject capture failure ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    if (options.snapshotFailure) await assert.rejects(h.post());
    else assert.equal((await h.post()).status, options.storageFailure ? 503 : 422);
    await assert.rejects(h.writer.findActiveContractTemplate());
    assert.equal(h.templates.length, 0); assert.equal(h.updates, 0);
    assert.equal(h.locks, 0);
  });
}
await test('legacy remains unchanged, with no downloads or snapshot backfill', async () => {
  const h = harness({ legacy: true }), before = structuredClone(h.templates);
  await h.writer.findActiveContractTemplate();
  assert.deepEqual(h.templates, before); assert.equal(h.downloads, 0); assert.equal(h.snapshots.size, 0);
});
await test('activation and INSERT roll back together', async () => {
  const h = harness({ legacy: true, templateFailure: true }), before = structuredClone(h.templates);
  await assert.rejects(h.writer.createContractTemplate({ name: 'New', version: '1', fileUrl: 'contract-templates/new.pdf', active: true }));
  assert.deepEqual(h.templates, before);
  assert.equal(h.updates, 1); assert.equal(h.snapshots.size, 1);
});
await test('authorization and invalid reference fail before download', async () => {
  const denied = harness({ denied: true }); assert.equal((await denied.post()).status, 403); assert.equal(denied.downloads, 0);
  const h = harness(); assert.equal((await h.post({ fileUrl: 'https://outside.invalid/a.pdf' })).status, 400);
  await assert.rejects(h.writer.createContractTemplate({ name: 'Bad', version: '1', fileUrl: 'bad', active: true }));
  assert.equal(h.downloads, 0); assert.equal(h.templates.length, 0);
});
await test('only authoritative module has a production template INSERT', async () => {
  const writers = [];
  for (const dir of ['app', 'lib']) for (const relative of readdirSync(dir, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(relative)) continue;
    const path = `${dir}/${relative}`.replaceAll('\\', '/');
    if (/contractTemplate\s*\.\s*(create|createMany|upsert)\s*\(/.test(readFileSync(path, 'utf8'))) writers.push(path);
  }
  assert.deepEqual(writers, ['lib/contract-templates.ts']);
});
await test('active true replaces legacy changing only active; false preserves current', async () => {
  const h = harness({ legacy: true });
  const legacy = structuredClone(h.templates[0]);
  const first = await (await h.post()).json();
  assert.deepEqual(h.templates[0], { ...legacy, active: false });
  const snapshotBefore = structuredClone([...h.snapshots.values()]);
  await h.post({ active: false });
  assert.deepEqual(h.templates.filter(t => t.active).map(t => t.id), [first.id]);
  assert.equal(h.locks, 1); assert.equal(h.updates, 1);
  assert.deepEqual(structuredClone([...h.snapshots.values()]), snapshotBefore);
});
await test('unknown UPDATE/INSERT failures propagate from POST and preserve active', async () => {
  for (const failure of ['updateFailure', 'templateFailure']) {
    const h = harness({ legacy: true, [failure]: true });
    const before = structuredClone(h.templates);
    await assert.rejects(h.post(), /failure/);
    assert.deepEqual(h.templates, before);
  }
});
await test('equal createdAt uses id DESC in selector and administrative GET', async () => {
  const h = harness();
  h.templates.push(...[3, 7, 4].map(id => ({ id, active: true, createdAt: '2026-01-01', fileUrl: 'contract-templates/a.pdf' })));
  assert.equal((await h.writer.findActiveContractTemplate()).id, 7);
  assert.deepEqual((await (await h.get()).json()).map(t => t.id), [7, 4, 3]);
});
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
await test('two ADMIN transactions queue at the simulated advisory lock', async () => {
  const ready = deferred(), firstLocked = deferred(), releaseFirst = deferred();
  let prepared = 0, acquired = 0;
  const h = harness({
    beforeTransaction: async () => { if (++prepared === 2) ready.resolve(); await ready.promise; },
    afterLock: async () => { if (++acquired === 1) { firstLocked.resolve(); await releaseFirst.promise; } },
  });
  const first = h.post({ name: 'A' }), second = h.post({ name: 'B' });
  await firstLocked.promise;
  assert.equal(h.locks, 1); assert.equal(h.updates, 0);
  releaseFirst.resolve();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(h.locks, 2);
  assert.equal(h.templates.filter(t => t.active).length, 1);
  assert.equal(h.templates.at(-1).active, true);
});
for (const legacy of [false, true]) await test(`bootstrap reuses winner after capture, legacy=${legacy}`, async () => {
  const prepared = deferred(), resume = deferred();
  let calls = 0;
  const h = harness({ beforeTransaction: async () => { if (++calls === 1) { prepared.resolve(); await resume.promise; } } });
  const bootstrap = h.writer.findActiveContractTemplate();
  await prepared.promise;
  let winner;
  if (legacy) {
    // Simulate a legacy row appearing before lock acquisition; never backfill it.
    winner = { id: 1, active: true, documentSnapshotId: null };
    h.templates.push(winner);
  } else winner = await (await h.post({ name: 'ADMIN' })).json();
  const updates = h.updates;
  resume.resolve();
  const result = await bootstrap;
  assert.equal(result.id, winner.id);
  assert.equal(result.documentSnapshotId, winner.documentSnapshotId);
  assert.equal(h.templates.length, 1); assert.equal(h.updates, updates);
  if (legacy) {
    // Actual session creation route must reject the returned legacy, before writes.
    const route = loader({
      'server-only': {}, 'next/server': { NextResponse: Response },
      '@/lib/auth-server': { requireStaffOrAdmin: async () => ({ ok: true, session: { user: { id: '1' } } }) },
      '@/lib/prisma': { prisma: { member: { findUnique: async () => ({ id: 17 }) } } },
      '@/lib/storage': {}, '@/lib/supabase-admin': {},
      '@/lib/signing-session': {},
      '@/lib/contract-templates': { findActiveContractTemplate: async () => result },
      '@/lib/signing-session-lifecycle': { createOrReissueSigningSession: () => assert.fail('legacy session write') },
    })('@/app/api/signing-sessions/route');
    const response = await route.POST(new Request('https://club.invalid', { method: 'POST', body: JSON.stringify({ memberId: 17 }) }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'SIGNING_TEMPLATE_SNAPSHOT_REQUIRED');
  }
});
await test('bootstrap wins first, waiting ADMIN replaces its candidate', async () => {
  const prepared = deferred(), resumeAdmin = deferred();
  let calls = 0;
  const h = harness({ beforeTransaction: async () => { if (++calls === 1) { prepared.resolve(); await resumeAdmin.promise; } } });
  const admin = h.post({ name: 'ADMIN' });
  await prepared.promise;
  const candidate = await h.writer.findActiveContractTemplate();
  resumeAdmin.resolve();
  const winner = await (await admin).json();
  assert.deepEqual(h.templates.filter(t => t.active).map(t => t.id), [winner.id]);
  assert.equal(h.templates.find(t => t.id === candidate.id).active, false);
  assert.equal(h.templates.find(t => t.id === candidate.id).documentSnapshotId, candidate.documentSnapshotId);
});
console.log(`Template snapshot/activation: ${checks} checks passed (simulated infrastructure; NOT real PostgreSQL concurrency or advisory-lock validation).`);
