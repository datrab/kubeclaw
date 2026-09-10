import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const sourceRoot = process.env.KUBECLAW_REVIEW_SOURCE_ROOT;
const proofRoot = process.env.KUBECLAW_REVIEW_V2_PROOF_ROOT;
assert(sourceRoot && path.isAbsolute(sourceRoot));
assert(proofRoot && path.isAbsolute(proofRoot));
const child = new URL('./delivery-manifest-v2-reader-corpus-child.mjs', import.meta.url);

function run(locale, encoding) {
  const result = spawnSync(process.execPath, [child.pathname, encoding], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: locale, LANG: locale, KUBECLAW_REVIEW_SOURCE_ROOT: sourceRoot,
      KUBECLAW_REVIEW_V2_PROOF_ROOT: proofRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('exact registered v2 corpus preserves both English outer-ref domains and Czech fail-closed behavior', () => {
  assert.deepEqual(run('en_US.UTF-8', 'untagged'), { accepted: true, same: true });
  assert.deepEqual(run('en_US.UTF-8', 'portable'), { accepted: true, same: true });
  const czech = run('cs_CZ.UTF-8', 'untagged');
  assert.equal(czech.accepted, false);
  assert.match(czech.error, /DELIVERY_MANIFEST_INVALID/);
});
