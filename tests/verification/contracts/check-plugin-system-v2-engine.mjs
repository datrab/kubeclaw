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
        'git.repository.read': { allowedPrefixes: ['Dockerfile'] },
        'artifacts.write': { allowedNamespaces: ['kubeclaw.delivery-lint'] },
      },
      'kubeclaw.telemetry-observer:telemetry': {
        'telemetry.emit': {
          allowedEventPrefixes: [
            'run.',
            'stage.',
            'attempt.',
            'effect.',
            'artifact.',
            'wait.',
            'orchestrator.',
          ],
        },
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
    administrativeDecisionIssuers: [],
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
  const packageIds = snapshot.packages.map(([id]) => id).sort();
  assert.equal(packageIds.length, 28, 'run snapshot must record the complete discovered registry');
  for (const id of [
    'kubeclaw.architecture-validator',
    'kubeclaw.artifact-store',
    'kubeclaw.delivery-lint',
    'kubeclaw.repository-adapter',
    'kubeclaw.telemetry-observer',
    'kubeclaw.telemetry-store',
  ]) assert.ok(packageIds.includes(id), `run snapshot missing ${id}`);
  assert.equal(snapshot.registrations.stages.length, 13);
  assert.equal(snapshot.registrations.observers.length, 5);
  assert.equal(snapshot.registrations.adapters.length, 14);
  assert.ok(snapshot.enabledRegistrations.includes('kubeclaw.delivery-lint:delivery-lint'));
  assert.ok(snapshot.grants.some(([id]) => id === 'kubeclaw.delivery-lint:delivery-lint'));
  assert.ok(snapshot.selectedProviders.some(({ capability }) => capability === 'git.repository.read'));
  assert.equal(snapshot.configuredStages[0].stageType, 'kubeclaw.lint.delivery');
  const telemetry = fs.readFileSync(path.join(temporary, 'telemetry.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(telemetry.some((entry) => entry.payload?.event?.type === 'run.succeeded'));
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-engine' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
