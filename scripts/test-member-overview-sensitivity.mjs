// Mutate transpiled source in child VMs only. No repository files are rewritten.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const route = "@/app/api/members/[id]/overview/route";
const core = "@/lib/member-operational-status";
const rules = "@/lib/sales-rules";
const dni = "@/lib/member-dni";
const exact = "exact DTO and no extra PII for STAFF";
const queries = "minimal selects, six domain reads, no Storage, no collection histories";
const shared = "shared helpers are actually invoked once";
const grams = "monthly grams use canonical normalization";
const mutations = [
  { name: "requireAuth permits persisted MEMBER", fails: "authorization and cache: persisted MEMBER", from: "requireStaffOrAdmin", to: "requireAuth" },
  { name: "JWT role replaces persisted authority", file: "@/lib/auth-server", fails: "authorization and cache: persisted MEMBER",
    from: "role: user.role,", to: "role: session.user.role," },
  { name: "persisted authority query bypassed", file: "@/lib/auth-server", fails: "authority is reread",
    from: 'const user = await prisma.appUser.findUnique({\n    where: { id: userId },\n    select: { id: true, active: true, role: true, name: true, email: true },\n  });',
    to: 'const user = { id: userId, active: true, role: session.user.role };' },
  { name: "inactive user accepted", file: "@/lib/auth-server", fails: "authorization and cache: inactive",
    from: "!user || user.active !== true", to: "!user" },
  { name: "private no-store removed", fails: exact, from: '"Cache-Control": "private, no-store"', to: '"Cache-Control": "public"' },
  { name: "Member spread", fails: exact, from: "id: member.id,", to: "...member, id: member.id," },
  ...["dni", "rfidCode", "commercialNotes", "dniFrontUrl", "dniBackUrl", "phone", "email"].map(field => ({
    name: `private field ${field}`, fails: exact, from: "id: member.id,", to: `id: member.id, ${field}: member.${field},`,
  })),
  { name: "contract relation spread", fails: exact,
    from: "contract ? { id: contract.id,", to: "contract ? { ...contract, id: contract.id," },
  { name: "DNI reference object serialized", fails: exact,
    from: "hasDniFront: Boolean(front)", to: "hasDniFront: front" },
  { name: "overbroad Member select", fails: queries,
    from: "active: true, expiresAt: true, rfidCode: true,", to: "active: true, expiresAt: true, rfidCode: true, dni: true," },
  { name: "full Product loaded with sales", fails: queries,
    from: "select: { qty: true, product: { select: { unit: true } } },", to: "include: { product: true }," },
  { name: "full document metadata loaded", file: dni, fails: queries,
    from: "select: { storageBucket: true, storageKey: true, mimeType: true, byteLength: true, sha256: true },", to: "" },
  { name: "Storage download attempted", fails: queries, edits: [
    { from: 'import { prisma } from "@/lib/prisma";', to: 'import { prisma } from "@/lib/prisma";\nimport { getSupabaseAdmin } from "@/lib/supabase-admin";' },
    { from: "const now = new Date();", to: 'await getSupabaseAdmin().storage.from("member-documents").download("private");\n    const now = new Date();' },
  ] },
  { name: "100 access events loaded", fails: queries, edits: [
    { from: "prisma.accessLog.findFirst({", to: "prisma.accessLog.findMany({ take: 100," },
    { from: "select: { type: true, createdAt: true },\n      }),", to: "select: { type: true, createdAt: true },\n      }).then(events => events[0] ?? null)," },
  ] },
  { name: "oldest reference contract", fails: "reference contract uses signedAt",
    from: 'orderBy: [{ signedAt: "desc" }, { id: "desc" }]', to: 'orderBy: [{ signedAt: "asc" }, { id: "desc" }]' },
  { name: "contract tie order reversed", fails: "reference contract uses signedAt",
    from: 'orderBy: [{ signedAt: "desc" }, { id: "desc" }]', to: 'orderBy: [{ signedAt: "desc" }, { id: "asc" }]' },
  { name: "pending session used as contract", fails: "missing contract is not replaced", from: "prisma.memberContract.findFirst", to: "prisma.signingSession.findFirst" },
  { name: "equivalent operational rules duplicated locally", fails: shared,
    from: "...composeMemberOperationalStatus(facts),",
    to: "expired: facts.expired, hasContract: facts.hasContract, canWithdraw: facts.active && !facts.expired && facts.hasContract, reasons: { inactive: !facts.active, noContract: !facts.hasContract, expired: facts.expired }," },
  { name: "withdraw always allowed", file: core, fails: "overview matches operational-status",
    from: "facts.active && !facts.expired && facts.hasContract", to: "true" },
  { name: "expiry equality changed", file: core, fails: "overview matches operational-status",
    from: "member.expiresAt.getTime() < now.getTime()", to: "member.expiresAt.getTime() <= now.getTime()" },
  { name: "literal gram normalization", file: rules, fails: grams,
    from: 'normalizeUnit(sale.product.unit) === "G"', to: 'sale.product.unit === "G"' },
  { name: "cancelled sales included", fails: grams, from: "memberId, cancelledAt: null, createdAt:", to: "memberId, createdAt:" },
  { name: "month replaces calendar with 30 days", file: rules, fails: "extracted month keeps local calendar",
    from: "end.setMonth(end.getMonth() + 1);", to: "end.setDate(end.getDate() + 30);" },
  { name: "non-finite guard removed", fails: "non-finite monthly totals", from: "!Number.isFinite(monthlyGrams)", to: "false" },
  { name: "legacy takes precedence over canonical", file: dni, fails: "DNI presence matrix",
    from: "if (document) return", to: "if (false && document) return" },
  { name: "unvalidated legacy presence", fails: "DNI canonical wins even",
    from: 'resolveMemberDni(memberId, "front", member.dniFrontUrl)', to: "Promise.resolve(Boolean(member.dniFrontUrl))" },
  { name: "access tie order reversed", fails: "last event uses createdAt",
    from: 'orderBy: [{ createdAt: "desc" }, { id: "desc" }]', to: 'orderBy: [{ createdAt: "desc" }, { id: "asc" }]' },
  { name: "physical presence inferred", fails: exact, from: "access: {", to: 'access: { isInside: lastEvent?.type === "IN",' },
];

for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, () => {
  const edits = (mutation.edits ?? [mutation]).map(edit => ({ file: mutation.file ?? route, from: edit.from, to: edit.to }));
  const files = [...new Set(edits.map(edit => fileURLToPath(new URL(`../${edit.file.slice(2)}.ts`, import.meta.url))))];
  const before = files.map(file => readFileSync(file, "utf8"));
  const env = { ...process.env, OVERVIEW_MUTATIONS: JSON.stringify(edits) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=${mutation.fails}`,
    fileURLToPath(new URL("./test-member-overview.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, "Mutation survived");
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing|SyntaxError|TypeError|ReferenceError/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
  assert.deepEqual(files.map(file => readFileSync(file, "utf8")), before, "mutations must not touch files");
});
