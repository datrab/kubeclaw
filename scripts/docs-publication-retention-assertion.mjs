import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function validateRetentionNativeAssertion(root, markdown) {
  const evidence = 'docs/blueprint/acceptance-evidence/publication-examples-20261027';
  const read = relative => fs.readFileSync(path.join(root, relative));
  const binding = JSON.parse(read(`${evidence}/native-retention-binding.json`));
  assert.equal(binding.schemaVersion, 'kubeclaw-publication-native-retention-binding.v1');
  const bytes = read(`${evidence}/native-retention-result.json`);
  assert.equal(sha(bytes), binding.receiptSha256, 'native retention receipt changed');
  const receipt = JSON.parse(bytes);
  const bodies = [...markdown.matchAll(/<<'SQL'\n([\s\S]*?)^SQL\s*$/gmu)];
  assert.equal(bodies.length, 1, 'native retention assertion needs exact source payload');
  assert.equal(sha(bodies[0][1]), receipt.sqlSha256, 'native retention SQL changed; fresh native assertion required');
  for (const input of binding.inputs) {
    assert(input.path.startsWith('tests/') || input.path === '.github/workflows/docs-native-retention.yaml');
    assert(!input.path.split('/').includes('..') && !path.isAbsolute(input.path));
    assert.equal(sha(read(input.path)), input.sha256, `native retention authority changed: ${input.path}`);
  }
  assert.equal(receipt.harnessSha256, sha(read('tests/verification/docs/check-published-retention-sql.py')));
  assert.equal(receipt.fullSchemaSha256, sha(read('tests/fixtures/litellm-database/schema.sql')));
  assert.equal(receipt.provenanceSha256, sha(read('tests/fixtures/litellm-database/provenance.json')));
  assert.equal(receipt.schemaVersion, 'kubeclaw-native-retention-sql-assertion.v1');
  assert.equal(receipt.ok, true); assert.equal(receipt.serverVersionNum, '180006');
  assert(Number.isSafeInteger(receipt.nonRootUid) && receipt.nonRootUid > 0);
  assert.equal(receipt.tcpListeners, false); assert.equal(receipt.localPeerAuthentication, true);
  assert.equal(receipt.fullSchemaLoaded, true); assert.equal(receipt.targetDatabaseOrDeploymentUsed, false);
  assert.deepEqual(receipt.cases.map(item => item.name), ['absent-record', 'sql-null', 'json-null',
    'absent-object-keys', 'valid-integer-duration-and-null', 'unexpected-values-withheld',
    'non-object-stop-observation', 'restored-exact-query']);
  for (const item of receipt.cases) {
    assert.equal(item.readOnly, true); assert.equal(item.rollbackObserved, true);
    assert.equal(item.rows.length, 3);
  }
  assert.equal(receipt.negative.nativeUnknownColumnRejected, true);
  assert.equal(receipt.negative.exitCode, 3);
  assert.deepEqual(receipt.cleanup, { complete: true, onlyOwnedClusterRemoved: true, serverStopped: true });
  return { assertion: 'exact-source reused native PostgreSQL18.6 CI result',
    receiptSha256: binding.receiptSha256, sourceCommit: binding.sourceCommit, runUrl: binding.runUrl,
    cases: receipt.cases.length, freshDatabaseExecutionByThisCheck: false,
    productionDatabaseOrEffectiveRetentionPolicyVerified: false };
}
