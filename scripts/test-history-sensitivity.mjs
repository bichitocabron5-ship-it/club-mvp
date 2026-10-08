import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const file = "@/app/api/members/[id]/history/route";
const mutations = [
  { from: "id: member.id,", to: "...member, id: member.id,", fails: "history exact whitelist STAFF", name: "Member spread" },
  ...["dniFrontUrl", "dniBackUrl"].map(field => ({ from: "id: member.id,", to: `id: member.id, ${field}: member.${field},`, fails: "history exact whitelist STAFF", name: field })),
  { from: 'auth.session.user.role === "ADMIN"', to: 'true', fails: "history exact whitelist STAFF", name: "commercial to STAFF" },
  { from: "product: { select: { name: true, unit: true } }", to: "product: true", fails: "history exact whitelist STAFF", name: "full product select" },
  { from: "product: { name: sale.product.name, unit: sale.product.unit }", to: "product: sale.product", fails: "history exact whitelist STAFF", name: "full product DTO" },
  { from: "id: sale.id,", to: "...sale, id: sale.id,", fails: "history exact whitelist STAFF", name: "Sale spread" },
  { from: "requireStaffOrAdmin", to: "requireAuth", fails: "history auth forbidden", name: "authorization" },
  { from: '"Cache-Control": "private, no-store"', to: "", fails: "history auth anonymous and cache", name: "cache" },
  { from: "!sale.cancelledAt", to: "true", fails: "aggregates preserve cancellation", name: "cancelled aggregate" },
  { from: "sale.finalAmount ?? sale.totalAmount", to: "(sale.finalAmount || sale.totalAmount)", fails: "aggregates preserve cancellation", name: "zero final" },
  { file: "@/app/api/members/[id]/identity/route", from: "fullName: member.fullName,", to: "fullName: member.fullName, rfidCode: member.rfidCode,", fails: "identity exact whitelist", name: "unnecessary identity RFID" },
  ...["identity", "registration"].flatMap(route => [
    { file: `@/app/api/members/[id]/${route}/route`, from: "return NextResponse.json({ member: {", to: "return NextResponse.json({ sales: await prisma.sale.findMany({ where: { memberId } }), member: {", fails: `${route} exact whitelist`, name: `${route} returns sales` },
    { file: `@/app/api/members/[id]/${route}/route`, from: "requireStaffOrAdmin", to: "requireAuth", fails: `${route} auth forbidden`, name: `${route} authorization` },
    { file: `@/app/api/members/[id]/${route}/route`, from: '"Cache-Control": "private, no-store"', to: "", fails: `${route} auth anonymous and cache`, name: `${route} cache` },
  ]),
  { file: "@/app/members/[id]/contract/page", from: "/identity", to: "/history", fails: "consumers separate identity and registration", name: "contract returns to history" },
  { file: "@/app/members/new/page", from: "/registration", to: "/history", fails: "consumers separate identity and registration", name: "new returns to history" },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, () => {
  const env = { ...process.env, HISTORY_MUTATIONS: JSON.stringify([{ file, ...mutation }]) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fileURLToPath(new URL("./test-history-hardening.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error); assert.equal(result.signal, null); assert.notEqual(result.status, 0);
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing|SyntaxError|TypeError|ReferenceError/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
});
