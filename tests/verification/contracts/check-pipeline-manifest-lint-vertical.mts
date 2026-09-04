import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as core from '../../../skills/nova/core/src/index.ts';
import { FileDurableBlobStore, FileDurableRecordStore } from '@kubeclaw/plugin-foundation/observability/durable-records';
import { createManifestParityFixture, legacyCompatibleWorkload, supportResources, workload } from './support/manifest-lint-parity-fixture.mts';

const fixture = createManifestParityFixture();
const artifacts = path.join(fixture.root, 'artifacts');
const pipelinePath = path.join(fixture.repository, '.swarm', 'pipeline.json');

function writeLintDeclaration(rawManifests: string[], helmCharts: string[]): void {
  fs.mkdirSync(path.dirname(pipelinePath), { recursive: true });
  fs.writeFileSync(pipelinePath, JSON.stringify({
    project: 'fixture',
    lint: {
      uses: 'kubeclaw.lint.full',
      policyProject: 'fixture',
      rawManifests,
      helmCharts,
    },
    modules: {},
    gates: {},
  }, null, 2));
}

function grantedRegistry() {
  const packages = core.discoverPackages({
    installationRoots: [
      path.resolve('skills/common/plugins'),
      path.resolve('skills/nova/plugins'),
      path.resolve('skills/buster/plugins'),
    ],
    trustPolicy: {
      trustedBuiltinRoots: [
        path.resolve('skills/common/plugins'),
        path.resolve('skills/nova/plugins'),
        path.resolve('skills/buster/plugins'),
      ],
      allowedSourceDigests: new Map(),
      verifiedAttestations: new Map(),
      verifierId: 'test:manifest-lint-parity-vertical',
    },
    now: () => new Date('2026-08-15T00:00:00Z'),
  });
  const snapshot = core.buildRegistry(packages);
  const registration = 'kubeclaw.lint:full';
  return core.resolveCapabilityGrants(snapshot, {
    enabledRegistrations: new Set([registration]),
    providers: new Map([
      ['lint.execute', 'kubeclaw.lint:executor'],
      ['artifacts.write', 'kubeclaw.artifact-store:artifact-store'],
    ]),
    grants: new Map([[registration, new Map([
      ['lint.execute', {
        allowedProjects: ['fixture'],
        allowedRoots: [fixture.repository],
        allowedPolicyRoots: [fixture.configuration],
      }],
      ['artifacts.write', { allowedNamespaces: ['kubeclaw.lint'] }],
    ])]]),
  });
}

async function runAuthoritative(runId: string): Promise<any> {
  const declaration = core.loadPipelineLintDeclaration(pipelinePath);
  assert.ok(declaration, 'the project must declare its complete Kubernetes lint inputs');
  const granted = grantedRegistry();
  const activated = await core.activateRegistry(granted.snapshot, new Set(granted.grants.keys()));
  const effects = new core.EffectCoordinator(
    new core.FileEffectJournal(path.join(fixture.root, `${runId}-effects.jsonl`)),
    undefined,
    undefined,
    new core.MemoryResourceLockManager(),
  );
  const adapters = new core.AdapterRuntime({
    granted,
    activated,
    configs: new Map([
      ['kubeclaw.lint:executor', {
        allowedRepositoryRoots: [fixture.repository],
        allowedPolicyRoots: [fixture.configuration],
      }],
      ['kubeclaw.artifact-store:artifact-store', { artifactRoot: artifacts }],
    ]),
    effects,
    shutdownTimeoutMs: 2_000,
    async emitDomainEvent() {},
  });
  await adapters.start();
  try {
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:${runId}`,
        maxConcurrency: 1,
        stages: [{
          id: 'manifest-lint',
          type: 'kubeclaw.lint.full',
          dependsOn: [],
          config: {
            policyPath: fixture.policyPath,
            policyProject: declaration.policyProject,
          },
          input: {
            workingDirectory: fixture.repository,
            project: 'fixture',
            kubernetes: {
              rawManifests: declaration.rawManifests,
              helmCharts: declaration.helmCharts,
            },
          },
          on: { request_fix: 'manifest-remediation' },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 120_000 },
        }, {
          id: 'manifest-remediation',
          type: 'kubeclaw.lint.full',
          dependsOn: ['manifest-lint'],
          config: { policyPath: fixture.policyPath, policyProject: declaration.policyProject },
          input: {
            workingDirectory: fixture.repository,
            project: 'fixture',
            kubernetes: {
              rawManifests: declaration.rawManifests,
              helmCharts: declaration.helmCharts,
            },
          },
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 120_000 },
        }],
      },
      registry: granted,
      activated,
      adapters,
      journal: new core.FileJournal(path.join(fixture.root, `${runId}-events.jsonl`)),
    });
    return await runner.run(`run:${runId}`);
  } finally {
    await adapters.shutdown();
  }
}

try {
  writeLintDeclaration(['raw.yaml'], ['charts/fixture']);
  fixture.writeRaw(`${legacyCompatibleWorkload()}${supportResources()}`);
  fixture.commit('authoritative valid manifest fixture');
  const valid = await runAuthoritative('valid');
  assert.equal(valid.status, 'succeeded');
  assert.equal(valid.stages.get('manifest-lint')?.status, 'succeeded');

  fixture.writeRaw(`${workload({ secondContainer: true, completeSecond: false })}${supportResources()}`);
  fixture.commit('authoritative policy finding fixture');
  const blocked = await runAuthoritative('policy-findings');
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.stages.get('manifest-lint')?.status, 'blocked');

  const records = new FileDurableRecordStore(artifacts, {
    maximumRecords: 100_000,
    maximumBytes: 256 * 1024 * 1024,
    maximumRecordBytes: 64 * 1024,
  });
  const stored = (await records.read<any>('artifacts/kubeclaw.lint')).at(-1)?.payload;
  assert.ok(stored, 'the real artifact store must contain the lint report');
  const blobs = new FileDurableBlobStore(artifacts, 16 * 1024 * 1024);
  const report = JSON.parse((await blobs.get(stored.digest)).toString('utf8'));
  assert.equal(report.tools['kubernetes-policy'].findings.some((entry: any) => entry.message.includes("container 'sidecar'")), true);
  assert.equal(report.tools['kubernetes-policy'].blocking_findings > 0, true);
  assert.equal(report.tools['kubernetes-policy'].evidence.some((entry: any) => entry.kind === 'policy-pack'), true);
  assert.equal(report.tools['kubernetes-schema'].evidence.some((entry: any) => entry.kind === 'kubeconform-output'), true);

  fs.writeFileSync(path.join(fixture.repository, 'invalid.yaml'), 'kind: Deployment\nmetadata: [\n');
  writeLintDeclaration(['invalid.yaml'], []);
  const invalid = await runAuthoritative('invalid-yaml');
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.stages.get('manifest-lint')?.status, 'blocked');

  console.log(JSON.stringify({
    ok: true,
    phase: 'manifest-lint-cutover-vertical',
    boundary: 'real-contained',
    novaPlugin: true,
    realHelm: true,
    realKubeconform: true,
    evidenceStored: true,
    authority: 'replacement-only',
  }));
} finally {
  fixture.cleanup();
}
