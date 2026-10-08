import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const mutations = [
  { name: "memberData spread", from: "id: member.id,", to: "...((memberData) => ({ ...memberData }))(member), id: member.id,", fails: "exact whitelist" },
  { name: "full Member query",
    from: "select: {\n      id: true,\n      memberNumber: true,\n      fullName: true,\n      dni: true,\n      phone: true,\n      active: true,\n      expiresAt: true,\n      rfidCode: true,\n      contracts:",
    to: "include: {\n      contracts:", fails: "exact whitelist" },
  ...["commercialNotes", "dniFrontUrl", "dniBackUrl", "photoUrl", "createdAt", "rfidCode"].map(field => ({ name: field,
    from: "id: member.id,", to: `id: member.id, ${field}: member.${field},`, fails: "exact whitelist" })),
  { name: "requireAuth", from: "requireStaffOrAdmin", to: "requireAuth", fails: "auth forbidden" },
  { name: "cache", from: '"Cache-Control": "private, no-store"', to: "", fails: "auth anonymous" },
  { name: "overbroad select", from: "phone: true,", to: "phone: true, commercialNotes: true,", fails: "exact whitelist" },
  { name: "hasRfid empty string", from: "hasRfid: facts.hasRfid,", to: "hasRfid: member.rfidCode !== null,", fails: "hasRfid preserves" },
  { name: "hasContract confused with operating permission", from: "hasContract: facts.hasContract,", to: "hasContract: facts.hasContract && member.active && !facts.expired,", fails: "hasContract preserves" },
  { name: "expired inclusive boundary", from: "expired: facts.expired,", to: "expired: member.expiresAt !== null && member.expiresAt.getTime() <= now.getTime(),", fails: "expired preserves" },
];
for (const mutation of mutations) test(`sensitivity ${mutation.name}`, () => {
  const env = { ...process.env, MEMBERS_LIST_MUTATIONS: JSON.stringify([mutation]) }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "scripts/test-members-list-hardening.mjs"], { env, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error); assert.equal(result.signal, null); assert.notEqual(result.status, 0);
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing|SyntaxError|TypeError|ReferenceError/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
});
