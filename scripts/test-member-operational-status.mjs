// Run: node scripts/test-member-operational-status.mjs
// Transpile and execute the production helper, following the focused test pattern.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const filename = new URL("../lib/member-operational-status.ts", import.meta.url);
const code = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, {
  exports,
  require(name) { throw new Error(`Unexpected dependency: ${name}`); },
  Date: class { constructor() { throw new Error("Unexpected internal clock"); } static now() { throw new Error("Unexpected internal clock"); } },
}, { filename: filename.pathname });
const { getMemberOperationalFacts } = exports;

const now = new Date("2026-09-19T12:34:56.789Z");
const future = new Date("2026-09-19T12:34:56.790Z");
const past = new Date("2026-09-19T12:34:56.788Z");
const contract = Object.freeze({ id: 42, consumptionGrams: 25 });
const unlimited = Object.freeze({ id: 43, consumptionGrams: null });
const legacy = Object.freeze({ id: 7, consumptionGrams: 12 });
const cases = [
  // name, active, expiresAt, contract, RFID, expired, hasContract, ID, limit, hasRfid
  ["A no expiration", true, null, contract, "TAG", false, true, 42, 25, true],
  ["B future", true, future, contract, "TAG", false, true, 42, 25, true],
  ["C past", true, past, contract, "TAG", true, true, 42, 25, true],
  ["D inactive", false, future, contract, "TAG", false, true, 42, 25, true],
  ["E no contract", true, future, null, "TAG", false, false, null, null, true],
  ["F no expiration or contract", true, null, null, "TAG", false, false, null, null, true],
  ["G independent facts", false, null, null, "TAG", false, false, null, null, true],
  ["H exact equality", true, new Date(now.getTime()), contract, "TAG", false, true, 42, 25, true],
  ["I contract without limit", true, future, unlimited, "TAG", false, true, 43, null, true],
  ["J no RFID", true, future, contract, null, false, true, 42, 25, false],
  ["K RFID present", true, future, contract, "TAG", false, true, 42, 25, true],
  ["L active and expired", true, past, contract, "TAG", true, true, 42, 25, true],
  ["M legacy projection", true, future, legacy, "TAG", false, true, 7, 12, true],
];
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
for (const [name, active, expiresAt, selected, rfidCode, expired, hasContract, currentContractId, monthlyLimitG, hasRfid] of cases) {
  test(name, () => {
    const member = Object.freeze({ active, expiresAt, rfidCode });
    const before = structuredClone({ member, selected, now });
    const result = getMemberOperationalFacts(member, selected, now);
    assert.deepEqual({ ...result }, {
      active, expiresAt, expired, hasContract, currentContractId, monthlyLimitG, hasRfid,
    });
    const repeated = getMemberOperationalFacts(member, selected, now);
    assert.deepEqual(repeated, result);
    assert.notEqual(repeated, result, "Each call returns a new object");
    assert.deepEqual({ member, selected, now }, before, "Inputs, including Dates, remain unchanged");
  });
}
test("Changing now across expiration changes only expired", () => {
  const member = { active: true, expiresAt: now, rfidCode: "TAG" };
  const before = getMemberOperationalFacts(member, contract, past);
  const equal = getMemberOperationalFacts(member, contract, now);
  const after = getMemberOperationalFacts(member, contract, future);
  assert.deepEqual(before, equal);
  assert.equal(before.expired, false);
  assert.equal(after.expired, true);
  assert.deepEqual({ ...after, expired: false }, { ...before });
});
test("Null contract never reuses previous call data", () => {
  const member = { active: true, expiresAt: null, rfidCode: null };
  getMemberOperationalFacts(member, contract, now);
  assert.deepEqual({ ...getMemberOperationalFacts(member, null, now) }, {
    active: true, expiresAt: null, expired: false, hasContract: false,
    currentContractId: null, monthlyLimitG: null, hasRfid: false,
  });
});
test("RFID presence is Boolean, without normalization", () => {
  for (const [rfidCode, expected] of [["", false], [" ", true]]) {
    assert.equal(getMemberOperationalFacts({ active: true, expiresAt: null, rfidCode }, null, now).hasRfid, expected);
  }
});
console.log(`${checks} checks passed against the production helper.`);
