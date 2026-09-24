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
  let inTransaction = false, downloads = 0, updates = 0;
  const db = {
    contractDocumentSnapshot: {
      async findUnique({ where }) { assert.equal(inTransaction, false); return snapshots.get(where.sha256) ?? null; },
      async create({ data }) {
        assert.equal(inTransaction, false);
        if (options.snapshotFailure) throw new Error('snapshot failure');
        const row = { id: randomUUID(), capturedAt: new Date(), ...data };
        snapshots.set(row.sha256, row); return row;
      },
    },
    contractTemplate: { async findFirst() { return templates.find(t => t.active) ?? null; } },
    async $transaction(run) {
      inTransaction = true;
      const staged = structuredClone(templates);
      try {
        const result = await run({ contractTemplate: {
          async updateMany() { updates++; staged.forEach(t => { t.active = false; }); },
          async create({ data }) {
            assert.ok(data.documentSnapshotId);
            if (options.templateFailure) throw new Error('insert failure');
            const row = { id: staged.length + 1, ...data }; staged.push(row); return row;
          },
        } });
        templates.splice(0, templates.length, ...staged); return result;
      } finally { inTransaction = false; }
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
        assert.equal(inTransaction, false); assert.equal(settings.cache, 'no-store'); downloads++;
        if (options.storageFailure) return { error: new Error('private storage'), data: null };
        return { error: null, data: new Blob([options.invalidPdf ? 'invalid' : bytes]) };
      },
    }) } }) },
  });
  return {
    templates, snapshots, get downloads() { return downloads; }, get updates() { return updates; },
    writer: load('@/lib/contract-templates'),
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
  });
}
await test('legacy remains unchanged, with no downloads or snapshot backfill', async () => {
  const h = harness({ legacy: true }), before = structuredClone(h.templates);
  await h.writer.findActiveContractTemplate();
  assert.deepEqual(h.templates, before); assert.equal(h.downloads, 0); assert.equal(h.snapshots.size, 0);
});
await test('activation and INSERT roll back together', async () => {
  const h = harness({ legacy: true, templateFailure: true }), before = structuredClone(h.templates);
  await assert.rejects(h.writer.createContractTemplate({ name: 'New', version: '1', fileUrl: 'contract-templates/new.pdf', active: true }, { deactivateActive: true }));
  assert.deepEqual(h.templates, before);
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
console.log(`Template snapshot capture: ${checks} checks passed (simulated infrastructure).`);
