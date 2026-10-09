// Explicit process TZ only for isolated test children; no application policy change.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

for (const zone of ["UTC", "Europe/Madrid"]) test(`overview calendar in isolated ${zone} runtime`, () => {
  const env = { ...process.env, TZ: zone, OVERVIEW_EXPECTED_TZ: zone };
  delete env.NODE_TEST_CONTEXT;
  delete env.OVERVIEW_MUTATIONS;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap",
    "--test-name-pattern=period follows request clock|extracted month keeps local calendar|monthly grams use canonical normalization",
    fileURLToPath(new URL("./test-member-overview.mjs", import.meta.url))], { env, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 3\b/);
});
