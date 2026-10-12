import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = 'skills/common/plugin-runtime/foundation/isolation/sandbox.c';
const builder = path.resolve('scripts/build-plugin-sandbox.mjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-helper-build-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed: ${result.error ?? result.signal ?? result.status}`);
}
try {
  fs.mkdirSync(path.dirname(path.join(directory, source)), { recursive: true });
  fs.copyFileSync(source, path.join(directory, source));
  const restricted = path.join(directory, 'restricted');
  run(process.execPath, [builder, '--buster-browser-helper', restricted], { cwd: directory });
  run(process.execPath, [builder], { cwd: directory });
  const tests = ['--test', 'scripts/tests/buster-helper-authority.test.mjs'];
  run(process.execPath, tests, { env: { ...process.env, BUSTER_RESTRICTED_HELPER: restricted } });
  run('python3', ['scripts/tests/buster-lock-inheritance.py']);
  const generic = path.join(directory, path.dirname(source), 'plugin-sandbox');
  const negative = spawnSync(process.execPath, tests, {
    env: { ...process.env, BUSTER_RESTRICTED_HELPER: generic }, encoding: 'utf8',
  });
  assert.equal(negative.status, 1, negative.stderr);
  assert.match(negative.stdout, /actual restricted helper rejects identity requests/u);
  assert.match(negative.stdout, /0 !== 77/u);
  process.stdout.write('Fresh generic-build negative control rejected by identity-policy oracle.\n');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
