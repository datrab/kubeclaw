import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipelineV2 } from '../../../skills/common/plugin-runtime/core/execution/engine.ts';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-engine-'));
try {
  const repository = path.resolve('.');
  const pluginRoots = [
    path.resolve('skills/common/plugins'),
    path.resolve('skills/nova/plugins'),
  ];
  const result = await runPipelineV2({
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: pluginRoots,
    trustedBuiltinRoots: pluginRoots,
    externalTrust: {
      allowedSourceDigests: {},
      verifiedAttestations: {},
    },
    providers: {
      'git.repository.read': 'kubeclaw.repository-adapter:repository',
      'artifacts.write': 'kubeclaw.artifact-store:artifact-store',
      'telemetry.emit': 'kubeclaw.telemetry-store:telemetry',
    },
    grants: {
      'kubeclaw.delivery-lint:delivery-lint': {
        'git.repository.read': { allowedPrefixes: [''] },
        'artifacts.write': { namespace: 'kubeclaw.delivery-lint' },
      },
      'kubeclaw.telemetry-observer:telemetry': {
        'telemetry.emit': { allowedEventPrefixes: [''] },
      },
    },
    adapters: {
      'kubeclaw.repository-adapter:repository': { repositoryRoot: repository },
      'kubeclaw.artifact-store:artifact-store': { artifactRoot: path.join(temporary, 'artifacts') },
      'kubeclaw.telemetry-store:telemetry': { journalPath: path.join(temporary, 'telemetry.jsonl') },
    },
    activeAdapters: [],
    observers: {
      'kubeclaw.telemetry-observer:telemetry': {},
    },
    storageRoot: path.join(temporary, 'state'),
    shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova',
  }, {
    schemaVersion: 'pipeline-definition.v2',
    id: 'test:delivery',
    maxConcurrency: 1,
    stages: [{
      id: 'delivery',
      type: 'kubeclaw.lint.delivery',
      dependsOn: [],
      config: {},
      input: { moduleId: 'api', dockerfile: null, staticPath: null },
      execution: { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 5000 },
    }],
  }, 'run:engine-test');
  assert.equal(result.status, 'succeeded');
  assert.equal(result.stages.get('delivery')?.status, 'succeeded');
  const snapshot = JSON.parse(fs.readFileSync(
    path.join(temporary, 'state', 'runs', 'run_engine-test', 'registry-snapshot.json'),
    'utf8',
  ));
  assert.deepEqual(snapshot.packages.map(([id]) => id).sort(), [
    'kubeclaw.artifact-store',
    'kubeclaw.delivery-lint',
    'kubeclaw.repository-adapter',
    'kubeclaw.telemetry-observer',
    'kubeclaw.telemetry-store',
  ]);
  const telemetry = fs.readFileSync(path.join(temporary, 'telemetry.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(telemetry.some((entry) => entry.payload?.event?.type === 'run.succeeded'));
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-engine' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
