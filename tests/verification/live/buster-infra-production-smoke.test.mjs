import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildBusterInfraTask,
  buildSmokeIdentity,
  parseResultMarker,
  verifyCompletionEvidence,
  verifyTelemetryEvidence,
} from './buster-infra-production-smoke.mjs';
import { validateBusterTaskPayload } from '../../../skills/buster/pipeline/services/task-validation.ts';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('real Buster infrastructure smoke publishes a canonical k8s task without local execution authority', () => {
  const identity = buildSmokeIdentity('unit-123');
  const payload = buildBusterInfraTask({
    identity,
    commitHash: 'a'.repeat(40),
    repoRoot: sourceRoot,
  });

  assert.equal(payload.task_type, 'module_test');
  assert.deepEqual(payload.suites, ['k8s']);
  assert.deepEqual(payload.capabilities, ['image_build', 'kubernetes']);
  assert.equal(payload.agent_judgment.required, false);
  assert.equal(payload.test_config.k8s.cleanup_policy, 'delete');
  assert.equal(payload.project, 'buster-infra-smoke');
  assert.match(payload.test_config.k8s.dockerfile, /Projects\/buster-infra-smoke\/src\/Dockerfile$/);
  assert.match(payload.output_file, /^Projects\/buster-infra-smoke\/src\/\.swarm\/live-buster-infra\/unit-123\/buster-output\.json$/);
  execFileSync('git', ['check-ignore', '-q', payload.output_file], { cwd: sourceRoot });
  assert.equal(validateBusterTaskPayload(payload).moduleId, identity.moduleId);

  const source = fs.readFileSync(path.join(sourceRoot, 'tests/verification/live/buster-infra-production-smoke.mjs'), 'utf8');
  assert.match(source, /import\('file:\/\/\/app\/skills\/pipeline\/tools\/redis\.ts'\)/);
  for (const forbidden of ['../../../skills/buster', 'processOneQueuedTask', 'processTask(', 'k8sSuite(', 'buildAndPushImage(']) {
    assert.equal(source.includes(forbidden), false, `live infrastructure smoke must not invoke ${forbidden}`);
  }
});

test('real Buster infrastructure smoke requires completion and telemetry evidence from Buster', () => {
  const identity = buildSmokeIdentity('unit-456');
  const digest = `sha256:${'b'.repeat(64)}`;
  const completion = {
    _id: '1-0',
    source: 'buster-pipeline',
    run_id: identity.runId,
    attempt: String(identity.attempt),
    dispatch_id: identity.dispatchId,
    status: 'PASS',
    outcome: 'PASS',
    verdict: JSON.stringify({
      suites: {
        k8s: {
          status: 'PASS',
          metadata: {
            deployed_image: `registry.local/app@${digest}`,
            registry_image_digest: digest,
            cleanup_policy: 'delete',
            test_namespace: 'test-live-buster-infra',
            checks: ['k8s-capability-preflight', 'buildkit-build-push', 'namespace-lease', 'manifest-apply', 'pods-ready', 'health-check']
              .map((name) => ({ name, passed: true, detail: 'ok' })),
          },
        },
      },
    }),
  };
  const evidence = verifyCompletionEvidence(completion, identity);
  assert.equal(evidence.namespace, 'test-live-buster-infra');
  assert.equal(evidence.registryDigest, digest);

  const telemetry = ['task_started', 'suite_started', 'suite_completed', 'task_completed'].map((pluginEvent, index) => [
    `${index + 1}-0`,
    ['data', JSON.stringify({
      type: 'plugin.event',
      plugin_id: 'buster',
      plugin_event: pluginEvent,
      run_id: identity.runId,
      dispatch_id: identity.dispatchId,
    })],
  ]);
  assert.deepEqual(verifyTelemetryEvidence(telemetry, identity), ['suite_completed', 'suite_started', 'task_completed', 'task_started']);

  const result = { ok: true, namespace: evidence.namespace };
  const marker = `KUBECLAW_BUSTER_INFRA_SMOKE_RESULT=${Buffer.from(JSON.stringify(result)).toString('base64url')}\n`;
  assert.deepEqual(parseResultMarker(marker), result);
});
