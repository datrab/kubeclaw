#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  BUSTER_CAPABILITIES,
  requiredCapabilitiesForSuite,
} from '../../../skills/buster/pipeline/services/capabilities.ts';
import {
  runSuites,
} from '../../../skills/buster/pipeline/runners/suite-runner.ts';

const capabilityCases = [
  {
    suite: 'build',
    config: { serve: { type: 'static' } },
    missing: [BUSTER_CAPABILITIES.IMAGE_BUILD, BUSTER_CAPABILITIES.KUBERNETES],
  },
  {
    suite: 'build',
    config: { serve: { type: 'server' } },
    missing: [BUSTER_CAPABILITIES.IMAGE_BUILD, BUSTER_CAPABILITIES.KUBERNETES],
  },
  {
    suite: 'k8s',
    config: {},
    missing: [BUSTER_CAPABILITIES.IMAGE_BUILD, BUSTER_CAPABILITIES.KUBERNETES],
  },
  {
    suite: 'a11y',
    config: {},
    missing: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION],
  },
  {
    suite: 'e2e',
    config: {},
    missing: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION],
  },
  {
    suite: 'visual-reg',
    config: {},
    missing: [BUSTER_CAPABILITIES.BROWSER_AUTOMATION],
  },
  {
    suite: 'perf',
    config: {},
    missing: [BUSTER_CAPABILITIES.LIGHTHOUSE],
  },
];

assert.deepEqual(
  requiredCapabilitiesForSuite('health', { config: { serve: { smoke_paths: ['/healthz'] } } }),
  [],
  'health smoke paths are bounded HTTP checks and must not require browser automation',
);

const swarmDir = path.join(process.cwd(), '.swarm');
fs.mkdirSync(swarmDir, { recursive: true });
const root = fs.mkdtempSync(path.join(swarmDir, 'contract-capability-env-'));

try {
  for (const item of capabilityCases) {
    const logDir = path.join(root, item.suite.replace(/[^a-zA-Z0-9._-]+/g, '_'));
    const result = await runSuites([item.suite], {
      repoRoot: process.cwd(),
      moduleId: `module-${item.suite}`,
      attempt: 1,
      logDir,
      capabilities: [],
      payload: {
        project: 'capability-env-contract',
        run_id: 'run-capability-env',
        module_id: `module-${item.suite}`,
        attempt: 1,
        dispatch_id: `dispatch-${item.suite}`,
        capabilities: [],
        test_config: {
          suite_timeout_ms: 300000,
          ...item.config,
        },
      },
    });

    assert.equal(result.criticalFailed, true, `${item.suite} denied capabilities must be critical`);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].suite, item.suite);
    assert.equal(result.results[0].status, 'ERROR');
    assert.equal(result.results[0].reason, 'buster_capability_denied');
    assert.deepEqual(result.results[0].metadata.missing_capabilities, item.missing);
    assert.deepEqual(result.results[0].metadata.required_capabilities, item.missing);

    const alertPath = path.join(logDir, 'tests', 'operator-alerts.jsonl');
    assert.equal(fs.existsSync(alertPath), true, `${item.suite} must write durable operator alert`);
    const alerts = fs.readFileSync(alertPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert(alerts.some((alert) => (
      alert.reason === 'buster_capability_denied'
      && alert.suite === item.suite
      && item.missing.every((capability) => alert.missing_capabilities.includes(capability))
    )), `${item.suite} alert must carry missing capability details`);
  }

  console.log(JSON.stringify({
    ok: true,
    contract: 'capability-env-degradation',
    suites_checked: capabilityCases.length,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
