#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  EXECUTION_ORDER,
  runSuites,
} from '../../../skills/buster/pipeline/runners/suite-runner.ts';

async function expectSuiteRequestRejected(suites, opts, expected) {
  await assert.rejects(
    () => runSuites(suites, opts),
    (error) => {
      assert.equal(error?.code, 'BUSTER_SUITE_REQUEST_INVALID');
      assert.equal(error?.details?.reason, expected.reason);
      if (expected.missingField) {
        assert(error.details.missing_fields?.includes(expected.missingField), `missing_fields must include ${expected.missingField}`);
      }
      if (expected.unknownSuite) {
        assert.deepEqual(error.details.unknown_suites, [expected.unknownSuite]);
      }
      return true;
    },
  );
}

const baseOptions = {
  moduleId: 'module-suite-contract',
  payload: {
    project: 'suite-timeout-contract',
  },
};

for (const suite of EXECUTION_ORDER) {
  await expectSuiteRequestRejected([suite], {
    ...baseOptions,
    payload: {
      ...baseOptions.payload,
    },
  }, {
    reason: 'invalid_test_config_shape',
  });

  await expectSuiteRequestRejected([suite], {
    ...baseOptions,
    payload: {
      ...baseOptions.payload,
      test_config: {},
    },
  }, {
    reason: 'missing_suite_timeout_ms',
    missingField: 'test_config.suite_timeout_ms',
  });

  await expectSuiteRequestRejected([suite], {
    ...baseOptions,
    payload: {
      ...baseOptions.payload,
      test_config: {
        suite_timeout_ms: 0,
      },
    },
  }, {
    reason: 'invalid_suite_timeout_ms',
  });
}

await expectSuiteRequestRejected(['missing-suite'], {
  ...baseOptions,
  payload: {
    ...baseOptions.payload,
    test_config: {
      suite_timeout_ms: 300000,
    },
  },
}, {
  reason: 'unknown_suite',
  unknownSuite: 'missing-suite',
});

console.log(JSON.stringify({
  ok: true,
  contract: 'suite-timeout-config',
  suites_checked: EXECUTION_ORDER.length,
  rejected_cases: (EXECUTION_ORDER.length * 3) + 1,
}, null, 2));
