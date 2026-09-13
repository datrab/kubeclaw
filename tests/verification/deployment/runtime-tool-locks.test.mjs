import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRuntimeToolLocks, updateRuntimeToolLocks } from '../../../scripts/runtime-tool-locks.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

test('runtime locks reject changed source, transitive wheels and Go sums without silently repairing them', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-runtime-locks-'));
  try {
    fs.mkdirSync(path.join(temporary, 'docker'));
    for (const item of ['python-tools', 'go-tools', 'runtime-tool-locks.json']) {
      fs.cpSync(path.join(root, 'docker', item), path.join(temporary, 'docker', item), { recursive: true });
    }
    assert.deepEqual(checkRuntimeToolLocks(temporary), { inputs: 4, locks: 5 });
    assert.deepEqual(updateRuntimeToolLocks(temporary), { inputs: 4, locks: 5 });
    for (const name of ['python-tools/buster.in', 'python-tools/buster.txt', 'go-tools/go.mod', 'go-tools/go.sum', 'go-tools/requirements.json']) {
      const file = path.join(temporary, 'docker', name);
      const original = fs.readFileSync(file);
      fs.appendFileSync(file, '\nchanged dependency input\n');
      const altered = fs.readFileSync(file);
      assert.throws(() => checkRuntimeToolLocks(temporary), /RUNTIME_TOOL_LOCK_DRIFT/);
      assert.deepEqual(fs.readFileSync(file), altered);
      fs.writeFileSync(file, original);
    }
    assert.deepEqual(checkRuntimeToolLocks(temporary), { inputs: 4, locks: 5 });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
