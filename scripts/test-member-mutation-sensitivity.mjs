// Mutate only loaded source in child processes, never working-tree files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const edit = "app/api/members/[id]/route.ts";
const status = "app/api/members/[id]/status/route.ts";
const rfid = "app/api/members/[id]/rfid/route.ts";
const create = "app/api/members/route.ts";
const mutations = [
  ...[edit, status].flatMap(file => [
    { name: `${file} full row`, file, from: "memberMutationJson({ ok: true })", to: "memberMutationJson(member)", fails: file === edit ? "exact edit DTO STAFF" : "exact status DTO" },
    ...["...member,", "dniFrontUrl: member.dniFrontUrl,", "dniBackUrl: member.dniBackUrl,", "commercialNotes: member.commercialNotes,", "storage: member.photoUrl,"].map(leak => ({
      name: `${file} ${leak}`, file, from: "{ ok: true }", to: `{ ${leak} ok: true }`, fails: file === edit ? "exact edit DTO STAFF" : "exact status DTO",
    })),
  ]),
  { name: "RFID full row", file: edit, from: "body: { rfidCode: member.rfidCode }", to: "body: member", fails: "exact RFID DTO" },
  { name: "create spread", file: create, from: "id: member.id,", to: "...member, id: member.id,", fails: "exact create DTO" },
  ...[edit, rfid, create].map(file => ({ name: `${file} auth weakened`, file, from: "requireStaffOrAdmin", to: "requireAuth", fails: `auth ${file === create ? "create" : file === rfid ? "rfid" : "edit"} persisted MEMBER` })),
  { name: "status STAFF allowed", file: status, from: "requireAdmin", to: "requireStaffOrAdmin", fails: "auth status STAFF" },
  { name: "RFID missing expected accepted", file: edit, from: "expectedRfidCode: z.string().nullable(),", to: "expectedRfidCode: z.string().nullable().default(null),", fails: "RFID preconditions conflicts rollback" },
  { name: "RFID unconditional write", file: edit, from: "where: { id: memberId, rfidCode: expected }", to: "where: { id: memberId }", fails: "RFID preconditions conflicts rollback" },
  { name: "RFID lost 409", file: edit, from: "status: 409", to: "status: 400", fails: "RFID preconditions conflicts rollback" },
  { name: "RFID audit removed", file: edit, from: "await tx.auditLog.create({", to: "await Promise.resolve({", fails: "exact RFID DTO transitions noops audit" },
  { name: "cache removed", file: "lib/member-mutation-response.ts", from: '"Cache-Control": "private, no-store"', to: "", fails: "controlled errors cache" },
  { name: "registration overwritten", file: "app/members/new/page.tsx",
    from: "setCreatedMember((current) => current ? { ...current, rfidCode: updated.rfidCode } : current);",
    to: "setCreatedMember(updated);", suite: "test-member-create.mjs", fails: "" },
];
for (const mutation of mutations) test(`sensitivity: ${mutation.name}`, () => {
  const env = { ...process.env, MEMBER_MUTATION_MUTATIONS: JSON.stringify([mutation]) };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
    fileURLToPath(new URL(`./${mutation.suite ?? "test-member-mutation-hardening.mjs"}`, import.meta.url))], {
    env, encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error); assert.equal(result.signal, null);
  assert.notEqual(result.status, 0, "Mutation survived behavioral suite");
  const output = result.stdout + result.stderr;
  assert.doesNotMatch(output, /Mutation anchor missing|SyntaxError|TypeError|ReferenceError/);
  assert.ok(output.split("\n").some(line => line.startsWith("not ok ") && line.includes(mutation.fails)), output);
  if (mutation.suite) assert.match(output, /AssertionError/);
});
