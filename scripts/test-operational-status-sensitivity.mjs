// Same in-memory mutation pattern as member-document UI sensitivity tests.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exact = "exact allowlisted DTO";
const mutations = [
  { name: "requireAuth instead of STAFF/ADMIN", fails: "persisted MEMBER despite ADMIN JWT",
    from: "requireStaffOrAdmin", to: "requireAuth" },
  { name: "Member spread", fails: exact, from: "id: member.id,", to: "...member, id: member.id," },
  ...["rfidCode", "commercialNotes", "dniFrontUrl", "dniBackUrl"].map(field => ({
    name: `serialize ${field}`, fails: exact, from: "id: member.id,", to: `id: member.id, ${field}: member.${field},`,
  })),
  { name: "serialize notes alias", fails: exact, from: "id: member.id,", to: "id: member.id, notes: member.commercialNotes," },
  ...["discountPercent", "commercialProfile"].map(field => ({
    name: `omit ${field}`, fails: exact, from: `${field}: member.${field},`, to: "",
  })),
  { name: "canWithdraw always true", fails: "unchanged facts: inactive",
    from: "facts.active && !facts.expired && facts.hasContract", to: "true" },
  { name: "canWithdraw always false", fails: exact,
    from: "facts.active && !facts.expired && facts.hasContract", to: "false" },
  { name: "remove cache policy", fails: "handled errors remain private and no-store",
    from: '"Cache-Control": "private, no-store"', to: "" },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, () => {
  const env = { ...process.env, OPERATIONAL_STATUS_MUTATIONS: JSON.stringify([mutation]) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
    fileURLToPath(new URL("./test-operational-status-hardening.mjs", import.meta.url))], {
    env, encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, "Mutation survived the behavioral suite");
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing|SyntaxError|TypeError|ReferenceError/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
});
