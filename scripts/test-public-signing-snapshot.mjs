// Production GET/POST, serializer and hash/PDF verification; in-memory DB only.
import assert from "node:assert/strict";
import { harness, snapshotId, templateBytes } from "./test-public-signing-identity.mjs";

let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
const otherId = "22222222-2222-4222-8222-222222222222";
const delivery = id => `?mode=document&expectedDocumentSnapshotId=${id}`;
const untouched = h => {
  assert.equal(h.calls.creates, 0); assert.equal(h.calls.audits, 0);
  assert.equal(h.state.session.status, "PENDING");
};

await test("GET delivers original snapshot bytes despite changed fileUrl/object", async () => {
  const options = { beforeDocumentRead() { throw new Error("Mutable Storage forbidden"); } };
  const h = harness(options);
  const shown = await h.get();
  assert.equal(shown.body.documentSnapshotId, snapshotId);
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.equal(shown.body.bytes, undefined);
  assert.ok(shown.body.contractTemplate.fileUrl.endsWith(delivery(snapshotId)));
  h.setFileUrl("https://foreign.invalid/replaced.pdf"); options.objectMissing = true;
  const pdf = await h.get(delivery(snapshotId));
  assert.equal(pdf.status, 200); assert.deepEqual(pdf.body, Buffer.from(templateBytes));
  assert.equal(pdf.headers.get("cache-control"), "no-store");
  assert.equal(pdf.headers.get("content-length"), String(templateBytes.length));
  assert.equal((await h.get()).body.contractTemplate.fileUrl, shown.body.contractTemplate.fileUrl);
  untouched(h); assert.equal(h.calls.transactions, 0);
});
for (const value of [undefined, null, "", "snapshot-a", 3, {}, true]) await test(`invalid evidence ${JSON.stringify(value)}`, async () => {
  const h = harness();
  assert.equal((await h.post({}, undefined, 30, { expectedDocumentSnapshotId: value })).status, 400);
  untouched(h); assert.equal(h.calls.transactions, 0);
});
await test("snapshot mismatch rejects before all writes", async () => {
  const h = harness();
  const r = await h.post({}, undefined, 30, { expectedDocumentSnapshotId: otherId });
  assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_DOCUMENT_CHANGED");
  untouched(h); assert.equal(h.calls.transactions, 0);
});
await test("claim and contract use exact session snapshot", async () => {
  const h = harness(); assert.equal((await h.post()).status, 200);
  assert.equal(h.state.contracts[0].documentSnapshotId, snapshotId);
  assert.equal(h.state.contracts[0].contractTemplateId, h.state.session.contractTemplateId);
});
for (const options of [{ snapshotCorrupt: true }, { snapshotMissing: true }]) await test("unverified snapshot fails closed", async () => {
  const h = harness(options);
  for (const r of [await h.get(), await h.get(delivery(snapshotId)), await h.post()]) {
    assert.equal(r.status, 503); assert.equal(r.body.code, "SIGNING_DOCUMENT_UNAVAILABLE");
  }
  untouched(h); assert.equal(h.calls.transactions, 0);
});
await test("legacy pending cannot deliver/sign; no fileUrl inference", async () => {
  const h = harness({ snapshotId: null });
  for (const r of [await h.get(), await h.get(delivery(snapshotId)), await h.post()]) {
    assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_DOCUMENT_REQUIRED");
  }
  untouched(h);
});
await test("legacy signed replay ignores invalid/absent evidence and missing snapshot", async () => {
  const options = {}, h = harness(options); await h.post();
  h.setSnapshotId(null); options.snapshotMissing = true;
  // Simulate historical null provenance on both rows.
  h.setContractSnapshotId(null);
  const r = await h.post({}, undefined, 30, { expectedDocumentSnapshotId: undefined });
  assert.equal(r.status, 200); assert.equal(r.body.status, "SIGNED");
  assert.equal(r.body.documentSnapshotId, null); assert.equal(h.calls.creates, 1);
});
await test("GET A then POST B association rejects old evidence and old document URL", async () => {
  const h = harness(); await h.get(); h.setSnapshotId(otherId);
  for (const r of [await h.get(delivery(snapshotId)), await h.post()]) {
    assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_DOCUMENT_CHANGED");
  }
  untouched(h); assert.equal(h.calls.transactions, 0);
});
await test("snapshot changes after preflight: conditional claim cannot sign B", async () => {
  const h = harness({ beforeClaim: state => { state.session.documentSnapshotId = otherId; } });
  const r = await h.post();
  assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_DOCUMENT_CHANGED");
  untouched(h);
});
await test("post-claim confirmation rejects unexpected snapshot and rolls back", async () => {
  const h = harness({ beforeClaimConfirmation: state => { state.session.documentSnapshotId = otherId; } });
  const r = await h.post();
  assert.equal(r.status, 409); assert.equal(r.body.code, "SIGNING_DOCUMENT_CHANGED");
  untouched(h); assert.deepEqual(h.state, h.initial);
});
await test("delivery validates evidence, token, expiry and status", async () => {
  const h = harness();
  for (const query of ["?mode=document", delivery("invalid")]) assert.equal((await h.get(query)).status, 400);
  assert.equal((await h.get(delivery(snapshotId), "invalid")).status, 404);
  assert.equal((await harness({ expired: true }).get(delivery(snapshotId))).status, 410);
  assert.equal((await harness({ status: "CANCELLED" }).get(delivery(snapshotId))).status, 404);
  untouched(h);
});
console.log(`${checks} snapshot signing checks passed; no real PostgreSQL/browser validation.`);
