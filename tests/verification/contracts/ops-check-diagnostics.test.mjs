import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const workflow = YAML.parse(fs.readFileSync('.github/workflows/build-ops-mcp.yaml', 'utf8'));
const script = workflow.jobs.validate.steps.find(step => step.name === 'Test Ops MCP').run;
function exercise(installStatus, testStatus) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-check-diagnostics-'));
  try {
    fs.writeFileSync(path.join(dir, 'npm'), `#!/bin/bash
printf '%s\\n' "$*" >> "$OPS_CALLS"
if [ "$1" = ci ]; then exit "$OPS_INSTALL_STATUS"; fi
printf 'failure %% marker\\r\\nsecond line\\n' >&2
exit "$OPS_TEST_STATUS"
`, { mode: 0o755 });
    const callsFile = path.join(dir, 'calls');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
        OPS_CALLS: callsFile, OPS_INSTALL_STATUS: String(installStatus), OPS_TEST_STATUS: String(testStatus) },
    });
    assert.equal(result.error, undefined);
    return { ...result, calls: fs.readFileSync(callsFile, 'utf8').trim().split('\n') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('installation failure retains exit and never starts tests', () => {
  const result = exercise(17, 0);
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls, ['ci --ignore-scripts']);
  assert.match(result.stdout, /::error title=Ops MCP install failed \(exit 17\)::/u);
});
test('test failure retains stderr and exit with escaped annotation data', () => {
  const result = exercise(0, 23);
  assert.equal(result.status, 23);
  assert.deepEqual(result.calls, ['ci --ignore-scripts', 'test']);
  assert.match(result.stdout, /failure % marker\r\nsecond line/u);
  assert.match(result.stdout, /::error title=Ops MCP test failed \(exit 23\)::failure %25 marker%0D%0Asecond line/u);
});
test('successful original commands emit no error annotation', () => {
  const result = exercise(0, 0);
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, ['ci --ignore-scripts', 'test']);
  assert.doesNotMatch(result.stdout, /::error/u);
});
