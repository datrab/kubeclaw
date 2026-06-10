import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FINDING_CODES,
  SCOPE,
  checkDependencyGraph,
} from '../../../../../skills/nova/pipeline/services/arch-validator-checks.ts';

const config = {
  paths: {
    progress_file: 'progress.json',
  },
};

test('checkDependencyGraph accepts dependencies on defined gates', () => {
  const findings = checkDependencyGraph({
    modules: {
      m1: { depends_on: [] },
      m2: { depends_on: ['m1', 'gate:approval'] },
    },
    gates: {
      approval: { type: 'approval' },
    },
  }, config);

  assert.deepEqual(findings, []);
});

test('checkDependencyGraph reports missing gate dependencies as blocking gate findings', () => {
  const findings = checkDependencyGraph({
    modules: {
      m1: { depends_on: ['gate:approval'] },
    },
    gates: {},
  }, config);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, FINDING_CODES.DEP_UNDEFINED_REF);
  assert.equal(findings[0].scope, SCOPE.GATE);
  assert.equal(findings[0].severity, 'blocking');
  assert.match(findings[0].explanation, /gate 'approval'/);
});
