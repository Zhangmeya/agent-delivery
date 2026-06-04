import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");

test("release verification uses split Vitest jobs before publishing", () => {
  for (const job of [
    "verify_canary_core",
    "verify_canary_general_tests",
    "verify_canary_serialized_server",
    "verify_stable_core",
    "verify_stable_general_tests",
    "verify_stable_serialized_server",
  ]) {
    assert.match(releaseWorkflow, new RegExp(`^  ${job}:`, "m"));
  }

  assert.match(releaseWorkflow, /run: pnpm test:run:general -- --group '\$\{\{ matrix\.group \}\}'/);
  assert.match(
    releaseWorkflow,
    /run: pnpm test:run:serialized -- --shard-index \$\{\{ matrix\.shard_index \}\} --shard-count \$\{\{ matrix\.shard_count \}\}/,
  );
  assert.doesNotMatch(releaseWorkflow, /run: pnpm test:run\s*$/m);
});

test("release publish jobs wait for every split verification lane", () => {
  for (const requiredNeed of [
    "verify_canary_core",
    "verify_canary_general_tests",
    "verify_canary_serialized_server",
    "verify_stable_core",
    "verify_stable_general_tests",
    "verify_stable_serialized_server",
  ]) {
    assert.match(releaseWorkflow, new RegExp(`^      - ${requiredNeed}$`, "m"));
  }
});

test("release publish jobs configure npm token auth before publishing", () => {
  const verifyAuthStepCount = releaseWorkflow.match(/- name: Verify npm auth/g)?.length ?? 0;
  assert.equal(verifyAuthStepCount, 2);

  const nodeAuthTokenCount = releaseWorkflow.match(/NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/g)?.length ?? 0;
  assert.equal(nodeAuthTokenCount, 4);
  assert.match(releaseWorkflow, /npm whoami/);
});
