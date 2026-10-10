import { overviewFromOperational } from "./fixtures/member-overview.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { uiHarness, deferred } from "./fixtures/member-document-ui-harness.mjs";

const identity = { fullName: "Identidad mínima", dni: "DOC", phone: "123", email: "mail@test.invalid" };
function contractHarness(fetch, id = "17") {
  return uiHarness({ path: "app/members/[id]/contract/page.tsx", name: "default", fetch, mocks: {
    "next/navigation": { useParams: () => ({ id }) },
    "@/components/ui/page-header": { PageHeader: () => null },
    "@/components/admin-signing-session": { AdminSigningPanel: "signing-panel" },
  } });
}
for (const mode of ["success", "401", "403", "404", "500", "network"]) test(`contract identity ${mode}: preserves signing panel and errors`, async () => {
  const calls = [];
  const h = contractHarness(async (url, options) => {
    calls.push({ url, options });
    if (mode === "network") throw new Error("network");
    return mode === "success" ? Response.json({ member: identity }) : Response.json({ error: "denied" }, { status: Number(mode) });
  });
  await h.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ url: "/api/members/17/identity", options: { cache: "no-store" } }]);
  const panel = h.nodes.find(n => n.type === "signing-panel");
  assert.equal(panel.props.memberId, 17); assert.equal(panel.props.showDocument, true);
  if (mode === "success") for (const value of Object.values(identity)) assert.ok(h.text.includes(value));
  else assert.ok(h.text.includes("No se pudieron cargar los datos del socio"));
  h.unmount();
});
test("contract invalid ID and unmount retain existing behavior", async () => {
  const h = contractHarness(() => { throw new Error("unexpected fetch"); }, "invalid");
  await h.flush(); assert.ok(!h.nodes.some(n => n.type === "signing-panel"));
  const pending = deferred(), late = contractHarness(() => pending.promise);
  late.unmount(); pending.resolve(Response.json({ member: identity })); await late.flush();
  assert.equal(late.lateUpdates, 0);
});
for (const finalAmount of [80, 0, null]) test(`member row displays canonical amount ${finalAmount}`, async () => {
  const member = { ...identity, id: 17, active: true, rfidCode: "USED", expiresAt: null, hasDniFront: true, hasDniBack: false };
  const sales = [{ id: 1, qty: 2, totalAmount: 100, finalAmount, originalAmount: 100, discountAmount: 20,
    discountReason: "Motivo", cancelledAt: null, cancelReason: null, createdAt: "2026-01-01", product: { name: "Producto", unit: "G" } }];
  const h = uiHarness({ path: "app/members/[id]/page.tsx", name: "default", mocks: {
    "next-auth/react": { useSession: () => ({ status: "authenticated", data: { user: { role: "STAFF" } } }) },
    "next/navigation": { useParams: () => ({ id: "17" }) },
    "@/components/member-documents-card": { MemberDocumentsCard: "documents-card" },
    "@/components/member-photo-card": { MemberPhotoCard: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
  }, fetch: async url => {
    if (url.endsWith("/history")) return Response.json({ member, sales, count: 1, totalSpent: finalAmount ?? 100 });
    if (url.endsWith("/overview")) return Response.json(overviewFromOperational({ member, expired: false, hasContract: false }, 17));
    return Response.json([]);
  } });
  await h.flush();
  const row = h.nodes.find(n => n.type === "article" && JSON.stringify(n).includes("Producto"));
  assert.ok(row);
  const value = (finalAmount ?? 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(JSON.stringify(row).includes(value));
  const docs = h.nodes.find(n => n.type === "documents-card");
  assert.equal(docs.props.initialFrontUrl, "/api/members/17/documents?side=front");
  assert.equal(docs.props.initialBackUrl, null);
  h.unmount();
});
