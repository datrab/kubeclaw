import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const upstream = 'skills/common/plugin-runtime/foundation/config/string-coerce-CIXf7egm.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knip-upstream-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function write(file, bytes) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  }
  for (const file of ['scripts/generate-knip-config.mjs', upstream,
    'skills/common/plugin-runtime/foundation/config/gateway-native-duration-sources.json']) {
    write(file, fs.readFileSync(path.join(repository, file)));
  }
  for (const directory of ['contracts/pipeline-test-gate/v1', 'contracts/prism/v1', 'skills/prism']) {
    write(`${directory}/package.json`, '{}');
  }
  fs.mkdirSync(path.join(root, 'charts/kubeclaw/files/config'), { recursive: true });
  return { root, run: (...args) => spawnSync(process.execPath, ['scripts/generate-knip-config.mjs', ...args],
    { cwd: root, encoding: 'utf8' }) };
}

test('upstream ownership is confined to export issues of one exact preserved module', t => {
  const { root, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'charts/kubeclaw/files/config/knip.json'), 'utf8'));
  assert.deepEqual(config.ignoreIssues, { [upstream]: ['exports'] });
  assert.equal(run('--check').status, 0);
});

test('changed upstream bytes fail generation and freshness checking before export classification', t => {
  const { root, run } = fixture(t);
  assert.equal(run().status, 0);
  fs.appendFileSync(path.join(root, upstream), '\n// changed upstream bytes\n');
  for (const args of [[], ['--check']]) {
    const result = run(...args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires unchanged pinned source bytes/);
  }
});
