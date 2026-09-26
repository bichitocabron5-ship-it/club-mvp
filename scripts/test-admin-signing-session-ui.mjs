// Real controller, GET and panel JSX with simulated HTTP/hooks/clock; no browser or database.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(name) {
    if (name in mocks) return mocks[name];
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name);
    const base = name.slice(2), file = base + (existsSync(base + '.ts') ? '.ts' : '.tsx');
    const exports = {};
    cache.set(name, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: load, Date, URL, Response, Request, setTimeout, clearTimeout, ...globals });
    return exports;
  }
  return load;
}
const { createSigningController, normalizeSession } = loader()('@/lib/admin-signing-session');
const pending = (extra = {}) => ({ id: 1, status: 'PENDING', expiresAt: new Date(Date.now() + 60000).toISOString(), signUrl: 'https://test/sign/current', documentUrl: '/api/signing-sessions/current?mode=document&expectedDocumentSnapshotId=snapshot', contractPdfUrl: null, ...extra });
const response = (session, status = 200) => Response.json({ session }, { status });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function harness(initial = pending()) {
  let state, now = Date.now(), result = initial, intercept;
  const calls = [], timers = new Map(); let timerId = 0;
  const clock = { now: () => now, setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
  const controller = createSigningController(17, s => { state = structuredClone(s); }, async (url, options) => {
    calls.push({ url, options });
    if (intercept) { const value = intercept(url, options); if (value) return value; }
    return response(result);
  }, clock);
  return { controller, calls, timers, get state() { return state; }, set result(v) { result = v; }, set intercept(v) { intercept = v; }, async advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.fn(); } await tick(); } };
}
let checks = 0;
async function test(name, run) { await run(); checks++; console.log('PASS ' + name); }
await test('default browser timers preserve their receiver before GET and when scheduling/disposing', async () => {
  const receiver = {}, calls = [], timers = new Map(); let state, timerId = 0;
  const browser = {
    receiver,
    clearTimeout(id) { if (this?.receiver !== receiver) throw new TypeError('Illegal invocation'); calls.push('clearTimeout'); timers.delete(id); },
    setTimeout(fn, delay) { if (this?.receiver !== receiver) throw new TypeError('Illegal invocation'); calls.push('setTimeout'); const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    fetch: async (url) => { calls.push(url); return response(pending()); },
  };
  // The old default copied native methods onto clock, changing their receiver.
  const oldClock = { clearTimeout: browser.clearTimeout, setTimeout: browser.setTimeout };
  assert.throws(() => oldClock.clearTimeout(undefined), /Illegal invocation/);
  assert.throws(() => oldClock.setTimeout(() => {}, 2000), /Illegal invocation/);
  const create = loader({}, browser)('@/lib/admin-signing-session').createSigningController;
  const controller = create(17, next => { state = next; });
  await controller.recover();
  assert.deepEqual(calls.slice(0, 2), ['clearTimeout', '/api/members/17/signing-sessions']);
  assert.equal(state.ready, true); assert.equal(timers.size, 2);
  await controller.recover();
  assert.equal(calls.filter(c => c === '/api/members/17/signing-sessions').length, 2);
  controller.dispose(); assert.equal(timers.size, 0);
});
await test('reload recovers current pending, expiry and link without POST', async () => {
  for (let i = 0; i < 2; i++) { const h = harness(); await h.controller.recover(); assert.equal(h.state.session.status, 'PENDING'); assert.ok(h.state.session.signUrl); assert.ok(h.state.session.expiresAt); assert.equal(h.calls[0].url, '/api/members/17/signing-sessions'); assert.equal(h.calls.length, 1); h.controller.dispose(); }
});
for (const status of ['EXPIRED', 'CANCELLED', 'SIGNED']) await test(status + ' strips link and stops timers', async () => {
  const h = harness(pending({ status })); await h.controller.recover(); assert.equal(h.state.session.signUrl, null); assert.equal(h.state.session.documentUrl, null); assert.equal(h.timers.size, 0);
});
await test('calculated expiry fires while a polling request is in flight', async () => {
  const h = harness(pending({ expiresAt: new Date(Date.now() + 3000).toISOString() })); await h.controller.recover();
  const wait = deferred(); h.intercept = () => wait.promise; await h.advance(2000); await h.advance(1001);
  assert.equal(h.state.session.status, 'EXPIRED'); assert.equal(h.state.session.signUrl, null);
  wait.resolve(response(pending())); await tick(); assert.equal(h.state.session.status, 'EXPIRED'); assert.equal(h.timers.size, 0);
});
await test('410 becomes expired, not generic error', async () => {
  const h = harness(); await h.controller.recover(); h.intercept = () => response(null, 410); await h.advance(2000);
  assert.equal(h.state.session.status, 'EXPIRED'); assert.equal(h.state.error, ''); assert.equal(h.timers.size, 0);
});
for (const [action, initial, result] of [['create', null, pending()], ['create', pending(), pending({ id: 2, signUrl: 'https://test/sign/replacement' })], ['cancel', pending(), pending({ status: 'CANCELLED' })]]) await test(action + ' updates authoritative state; double click sends one POST', async () => {
  const h = harness(initial); await h.controller.recover(); const wait = deferred(); h.intercept = (_, options) => options.method === 'POST' ? wait.promise : null;
  const first = h.controller.mutate(action), second = h.controller.mutate(action);
  assert.equal(h.state.busy, true); assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 1);
  h.result = result; wait.resolve(response(null)); await Promise.all([first, second]);
  assert.equal(h.state.session.id, result.id); assert.equal(h.state.session.status, result.status); assert.equal(h.state.busy, false);
  if (action === 'cancel') { assert.equal(h.calls[1].url, '/api/members/17/signing-sessions/1/cancel'); assert.equal(h.state.session.signUrl, null); }
  else assert.equal(h.state.session.signUrl, result.signUrl);
  h.controller.dispose();
});
await test('stale polling cannot overwrite reissue', async () => {
  const h = harness(); await h.controller.recover(); const wait = deferred(); let block = true;
  h.intercept = (_, o) => !o.method && block ? wait.promise : null;
  await h.advance(2000); block = false; h.result = pending({ id: 2 }); await h.controller.mutate('create');
  wait.resolve(response(pending({ status: 'SIGNED' }))); await tick(); assert.equal(h.state.session.id, 2); assert.equal(h.state.session.status, 'PENDING'); h.controller.dispose();
});
await test('signature stops polling and uses contractual PDF', async () => {
  const h = harness(); await h.controller.recover(); h.result = pending({ status: 'SIGNED', contractPdfUrl: '/api/contracts/42/pdf' }); await h.advance(2000);
  assert.equal(h.state.session.signUrl, null); assert.equal(h.state.session.contractPdfUrl, '/api/contracts/42/pdf'); assert.equal(h.timers.size, 0);
  const count = h.calls.length; await h.advance(100000); assert.equal(h.calls.length, count);
});
await test('terminal error stops polling, hides link and requires recovery before mutations', async () => {
  const h = harness(); await h.controller.recover(); h.intercept = () => response(null, 403); await h.advance(2000);
  assert.ok(h.state.error); assert.equal(h.state.session.signUrl, null); assert.equal(h.state.session.documentUrl, null); assert.equal(h.timers.size, 0);
  const count = h.calls.length; await h.controller.mutate('create'); assert.equal(h.calls.length, count);
});
await test('dispose clears timers and ignores deferred responses', async () => {
  const h = harness(); await h.controller.recover(); const wait = deferred(); h.intercept = () => wait.promise;
  await h.advance(2000); const before = h.state; h.controller.dispose(); assert.equal(h.timers.size, 0);
  wait.resolve(response(pending({ status: 'SIGNED' }))); await tick(); assert.deepEqual(h.state, before);
});
async function getApi(row, { denied = false, id = '17' } = {}) {
  let query;
  const route = loader({
    '@/lib/auth-server': { requireStaffOrAdmin: async () => denied ? { ok: false, error: 'FORBIDDEN', status: 403 } : { ok: true } },
    '@/lib/prisma': { prisma: { member: { findUnique: async () => ({ id: 17 }) }, signingSession: { findFirst: async q => { query = q; if (!Array.isArray(row)) return row; const order = Array.isArray(q.orderBy) ? q.orderBy : [q.orderBy]; return row.filter(r => r.memberId === q.where.memberId).sort((a, b) => { for (const spec of order) { const [field, direction] = Object.entries(spec)[0]; const delta = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0; if (delta) return direction === 'desc' ? -delta : delta; } return 0; })[0] ?? null; } } } },
    'next/server': { NextResponse: Response },
  })('@/app/api/members/[id]/signing-sessions/route');
  const res = await route.GET(new Request('https://test/api/members/17/signing-sessions'), { params: Promise.resolve({ id }) });
  return { res, data: await res.json(), query };
}
for (const status of ['PENDING', 'CANCELLED', 'SIGNED', 'EXPIRED']) await test('GET minimal current session: ' + status, async () => {
  const row = { id: 1, status: status === 'EXPIRED' ? 'PENDING' : status, expiresAt: new Date(status === 'EXPIRED' ? 0 : Date.now() + 60000), token: 'private-token', documentSnapshotId: 'snapshot', contract: status === 'SIGNED' ? { id: 42 } : null };
  const { res, data, query } = await getApi(row); assert.equal(data.session.status, status); assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(query.where.memberId, 17); assert.equal(query.orderBy.id, 'desc');
  assert.deepEqual(Object.keys(data.session).sort(), ['contractPdfUrl', 'documentUrl', 'expiresAt', 'id', 'signUrl', 'status']);
  assert.equal('token' in data.session, false); if (status !== 'PENDING') assert.ok(!JSON.stringify(data).includes('private-token'));
  if (status === 'SIGNED') assert.equal(data.session.contractPdfUrl, '/api/contracts/42/pdf');
});
await test('GET none, auth and invalid IDs', async () => {
  assert.equal((await getApi(null)).data.session, null);
  const denied = await getApi(null, { denied: true }); assert.equal(denied.res.status, 403); assert.equal(denied.query, undefined);
  for (const id of ['bad', '0', '-1', '2147483648']) assert.equal((await getApi(null, { id })).res.status, 400);
});
// Execute actual JSX with a controlled state, then render via React server renderer.
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
function panelHtml(session) {
  let first = true;
  const Panel = loader({ react: { ...React, useEffect() {}, useRef: () => ({ current: null }), useState(initial) { if (first) { first = false; return [{ session: normalizeSession(session), ready: true, busy: false, error: '' }, () => {}]; } return [initial, () => {}]; } } })('@/components/admin-signing-session').AdminSigningPanel;
  return renderToStaticMarkup(React.createElement(Panel, { memberId: 17, showDocument: true }));
}
await test('rendered pending includes expiration, copy, cancel and reissue', () => {
  const html = panelHtml(pending()); for (const text of ['Sesión activa', 'Caducidad', 'Copiar enlace', 'Cancelar sesión', 'Reemitir']) assert.ok(html.includes(text));
});
for (const status of ['EXPIRED', 'CANCELLED', 'SIGNED']) await test('rendered ' + status + ' has no active/copy/sign/document link', () => {
  const html = panelHtml(pending({ status, contractPdfUrl: status === 'SIGNED' ? '/api/contracts/42/pdf' : null }));
  for (const text of ['Sesión activa', 'Copiar enlace', '/sign/current', 'mode=document']) assert.ok(!html.includes(text));
  if (status === 'SIGNED') assert.ok(html.includes('/api/contracts/42/pdf'));
});
await test('new-member page reload fetches backend member and mounts panel for that member', async () => {
  const slots = [], effects = [], calls = []; let cursor = 0;
  const member = { id: 17, fullName: 'Recovered member', dni: 'DOC', phone: null, email: null, active: true, expiresAt: null, rfidCode: null };
  const hooks = {
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useEffect(fn) { const index = cursor++; if (!(index in slots)) { slots[index] = true; effects.push(fn); } },
  };
  const jsx = (type, props) => ({ type, props });
  const Page = loader({ react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' },
    '@/components/ui/page-header': { PageHeader: 'header' }, '@/components/admin-signing-session': { AdminSigningPanel: 'SigningPanel' } }, {
    window: { location: { href: 'https://test/members/new?memberId=17' } }, queueMicrotask,
    fetch: async (url, options) => { calls.push({ url, options }); return Response.json({ member }); },
  })('@/app/members/new/page').default;
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const initial = Page();
  assert.equal(nodes(initial).find(n => n.type === 'button' && n.props.type === 'submit').props.disabled, true);
  effects.splice(0).forEach(fn => fn()); await tick(); cursor = 0;
  const tree = Page();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/members/17/history'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(nodes(tree).find(n => n.type === 'SigningPanel').props.memberId, 17);
  assert.equal(nodes(tree).some(n => n.type === 'form'), false);
});
await test('stale poll cannot overwrite cancellation; no automatic POST after failure', async () => {
  const h = harness(); await h.controller.recover(); const wait = deferred(); let block = true;
  h.intercept = (_, options) => !options.method && block ? wait.promise : null;
  await h.advance(2000); block = false; h.result = pending({ status: 'CANCELLED' }); await h.controller.mutate('cancel');
  wait.resolve(response(pending())); await tick(); assert.equal(h.state.session.status, 'CANCELLED'); assert.equal(h.timers.size, 0);
  h.controller.dispose();
  const failed = harness(); await failed.controller.recover(); failed.intercept = () => { throw new Error('network'); };
  await failed.controller.mutate('create'); assert.equal(failed.state.busy, false); assert.equal(failed.state.ready, false);
  await failed.advance(100000); assert.equal(failed.calls.filter(c => c.options.method === 'POST').length, 1);
});
await test('GET chooses lifecycle insertion order despite reversed transaction start timestamps', async () => {
  const base = { memberId: 17, expiresAt: new Date(Date.now() + 60000), contract: null, documentSnapshotId: 'snapshot' };
  const older = { ...base, id: 40, createdAt: new Date(2000), status: 'CANCELLED', token: 'historical-secret' };
  const latest = { ...base, id: 41, createdAt: new Date(1000), status: 'PENDING', token: 'current-secret' };
  const otherMember = { ...base, memberId: 18, id: 42, createdAt: new Date(3000), status: 'PENDING', token: 'other-secret' };
  for (const rows of [[older, latest, otherMember], [otherMember, latest, older]]) {
    const { data } = await getApi(rows);
    assert.equal(data.session.id, 41); assert.equal(data.session.status, 'PENDING');
    assert.equal(data.session.signUrl, 'https://test/sign/current-secret');
    assert.ok(!JSON.stringify(data).includes('historical-secret')); assert.ok(!JSON.stringify(data).includes('other-secret'));
  }
});
await test('pending PDF preview is restored and removed by every terminal state', async () => {
  const row = { id: 1, status: 'PENDING', expiresAt: new Date(Date.now() + 60000), token: 'current', documentSnapshotId: 'snapshot', contract: null };
  const { data } = await getApi(row);
  assert.equal(data.session.documentUrl, '/api/signing-sessions/current?mode=document&expectedDocumentSnapshotId=snapshot');
  assert.ok(panelHtml(data.session).includes('Ver contrato PDF'));
  for (const status of ['SIGNED', 'CANCELLED', 'EXPIRED']) {
    const session = normalizeSession({ ...data.session, status });
    assert.equal(session.documentUrl, null); assert.ok(!panelHtml(session).includes('mode=document'));
  }
  assert.equal((await getApi({ ...row, documentSnapshotId: null })).data.session.documentUrl, null);
  const legacy = (await getApi({ ...row, status: 'SIGNED', contract: null })).data.session;
  assert.equal(legacy.contractPdfUrl, null); assert.ok(!panelHtml(legacy).includes('/api/contracts/'));
  assert.ok(panelHtml(legacy).includes('/members/17'));
});
await test('late initial recovery cannot overwrite a later recovery or mutation', async () => {
  const h = harness(); const wait = deferred(); let block = true;
  h.intercept = () => block ? wait.promise : null;
  const initial = h.controller.recover(); await h.controller.mutate('create');
  assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 0);
  block = false; await h.controller.recover(); h.result = pending({ id: 2 }); await h.controller.mutate('create');
  wait.resolve(response(pending({ id: 1, status: 'SIGNED' }))); await initial;
  assert.equal(h.state.session.id, 2); assert.equal(h.state.session.status, 'PENDING'); h.controller.dispose();
});
for (const action of ['create', 'cancel']) await test(action + ' success plus failed refresh never repeats POST; guard releases after recovery', async () => {
  const h = harness(); await h.controller.recover();
  h.intercept = (_, options) => options.method === 'POST' ? response(null) : response(null, 500);
  await h.controller.mutate(action);
  assert.equal(h.state.ready, false); assert.equal(h.state.busy, false); assert.ok(h.state.error);
  assert.equal(h.state.session.signUrl, null); assert.equal(h.state.session.documentUrl, null);
  await h.advance(60000); await h.controller.mutate(action);
  assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 1);
  h.intercept = null; h.result = pending({ expiresAt: new Date(Date.now() + 600000).toISOString() });
  await h.controller.recover(); await h.controller.mutate(action);
  assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 2); h.controller.dispose();
});
await test('mounted panel wires guarded buttons, disabled feedback, signing callback and unmount cleanup', async () => {
  const slots = [], effects = [], cleanups = [], calls = [], timers = new Map(), signed = [];
  let cursor = 0, timerId = 0, session = null, intercept;
  const hooks = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++; if (!(i in slots) || deps.some((d, j) => d !== slots[i][j])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  const Panel = loader({ react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    fetch: async (url, options) => { calls.push({ url, options }); return intercept?.(url, options) ?? response(session); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
  })('@/components/admin-signing-session').AdminSigningPanel;
  const onSigned = value => signed.push(value);
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const render = () => { cursor = 0; const tree = Panel({ memberId: 17, onSigned, showDocument: true }); effects.splice(0).forEach(fn => fn()); return tree; };
  const button = (tree, text) => nodes(tree).find(n => n.type === 'button' && JSON.stringify(n.props.children).includes(text));
  intercept = () => response(null, 500);
  let tree = render(); assert.equal(button(tree, 'Crear').props.disabled, true);
  await tick(); tree = render();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/api/members/17/signing-sessions');
  assert.equal(button(tree, 'Crear').props.disabled, true);
  assert.equal(slots[0].ready, false); assert.equal(slots[0].session, null); assert.ok(slots[0].error);
  intercept = null;
  button(tree, 'Actualizar estado').props.onClick(); await tick(); tree = render();
  assert.equal(calls.length, 2); assert.equal(calls[1].url, '/api/members/17/signing-sessions');
  const create = button(tree, 'Crear'); assert.equal(create.props.disabled, false);
  const wait = deferred(); intercept = (_, options) => options.method === 'POST' ? wait.promise : undefined;
  create.props.onClick(); create.props.onClick(); tree = render();
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 1); assert.equal(button(tree, 'Crear').props.disabled, true);
  session = pending(); wait.resolve(response(null)); await tick(); tree = render();
  assert.equal(button(tree, 'Cancelar').props.disabled, false); assert.equal(button(tree, 'Reemitir').props.disabled, false);
  assert.ok(nodes(tree).some(n => n.type === 'a' && n.props.href === session.documentUrl));
  assert.equal(timers.size, 2);
  session = pending({ status: 'SIGNED', contractPdfUrl: '/api/contracts/42/pdf' });
  const poll = [...timers].find(([, timer]) => timer.delay === 2000); timers.delete(poll[0]); poll[1].fn();
  await tick(); tree = render();
  assert.equal(signed.at(-1), true); assert.equal(timers.size, 0);
  assert.ok(nodes(tree).some(n => n.type === 'a' && n.props.href === '/api/contracts/42/pdf'));
  assert.ok(!nodes(tree).some(n => n.type === 'a' && n.props.href.includes('mode=document')));
  cleanups.forEach(fn => fn?.()); assert.equal(timers.size, 0);
  slots.length = 0; cleanups.length = 0; session = pending(); intercept = null;
  render(); await tick(); render(); assert.equal(timers.size, 2);
  cleanups.forEach(fn => fn?.()); assert.equal(timers.size, 0);
});
console.log(`${checks} signing UI/recovery checks passed (simulated HTTP/hooks/timers, no real browser).`);
