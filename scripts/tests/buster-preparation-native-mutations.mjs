import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run only under the same separately prepared native guest identity and inputs
// as verify:buster:preparation-native. No host setup or unavailable-case skip.
const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.argv[2];
assert.ok(evidence && path.isAbsolute(evidence), 'explicit private guest evidence directory required');
fs.mkdirSync(evidence, { recursive: true });
const module = path.join(root, 'tests/verification/reliability/buster-preparation-native-recovery-live.mts');
const loader = path.join(root, 'tests/fixtures/test-gate/native-preparation-release-mutant.mjs');
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
for (const variant of ['baseline', 'omit-durable-release']) {
  const flags = variant === 'baseline' ? [] : ['--import', loader];
  const args = [...flags, '--test', '--test-concurrency=1', '--test-name-pattern=actual before-release SIGKILL', module];
  const result = spawnSync(process.execPath, args, { cwd: root, env: environment,
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 660_000 });
  fs.writeFileSync(path.join(evidence, `${variant}.txt`), `${result.stdout}\n${result.stderr}`);
  fs.writeFileSync(path.join(evidence, `${variant}.json`), JSON.stringify({ args, status: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null }, null, 2));
  assert.equal(result.error, undefined, 'launcher/timeout failure is not mutation detection');
  assert.equal(result.signal, null);
  if (variant === 'baseline') assert.equal(result.status, 0, 'the unchanged actual crash case must first pass');
  else {
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /BUSTER_PREPARATION_RECOVERY_REQUIRED|AssertionError/u);
    assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND|SyntaxError|mutation anchor/u);
  }
}
