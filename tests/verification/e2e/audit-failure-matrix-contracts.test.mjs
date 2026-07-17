import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { auditFailureMatrixContracts } from './audit-failure-matrix-contracts.mjs';

test('failure matrix contract audit materializes every scenario fresh and restored without stale harness drift', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-contract-audit-test-'));
  const result = auditFailureMatrixContracts({ rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.cases.length, 92);
  assert.deepEqual(result.failures, []);
  assert.equal(result.cases.every((entry) => entry.ok === true), true);
});

test('failure matrix contract audit catches stale restored checkpoint runtime defaults', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-contract-audit-suite-test-'));
  const result = auditFailureMatrixContracts({ suites: ['module-failure-retry'], rootDir });
  const restoredRetry = result.cases.find((entry) => (
    entry.scenario === 'forge-retry-then-success' && entry.mode === 'restored'
  ));

  assert.equal(result.ok, true);
  assert.equal(restoredRetry?.ok, true);
  assert.equal(restoredRetry.boundary, 'modules');
});
