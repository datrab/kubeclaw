import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const encoded = process.env.BUSTER_PREPARATION_ASSIGNED_CLEANUP;
const root = process.env.BUSTER_PREPARATION_ASSIGNED_SOURCE_ROOT;
assert.ok(encoded && root);
const association = JSON.parse(encoded);
assert.match(association.effects.admissionId, /^[a-f0-9]{32}$/u);
const intended = path.join(root, association.effects.admissionId, 'data');
const remove = fs.rm.bind(fs);
let intercepted = false;
fs.rm = async (target, options) => {
  assert.equal(target, intended, 'only the assigned owned data deletion may reach the barrier');
  assert.equal(options?.recursive, true);
  assert.equal(intercepted, false);
  intercepted = true;
  await remove(target, options);
  await assert.rejects(fs.lstat(intended), { code: 'ENOENT' });
  process.stderr.write('BUSTER_NATIVE_TEST_OWNED_DATA_REMOVED\n');
  await new Promise<void>(() => { setInterval(() => {}, 1000); });
};
// This imports the original production host, not a copied or modeled executor.
await import('../../../skills/buster/engine/test-gates/preparation-cleanup-host.ts');
