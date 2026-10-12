import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { buildRegistry, discoverPackages, resolveTestPlan, createProductionNovaTestGate } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';
import { gateCoverageDigest, parseGateDecision, type GateCoverageV1 } from '@kubeclaw/pipeline-test-gate-contract';

test('original remote Buster skipped execution cannot fulfil required coverage at the same Git candidate', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-remote-'));
  const repository = path.join(temporary, 'repository');
  fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, 'README.md'), 'Real committed candidate for skipped-coverage proof.\n');
  execFileSync('git', ['init', '-q', repository]);
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=Coverage Proof', '-c', 'user.email=coverage@example.invalid', 'commit', '-qm', 'candidate']);
  const revision = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'coverage-remote',
  } }));
  const keys = crypto.generateKeyPairSync('ed25519');
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };
  const store = new FileBusterPlanJobStore(path.join(temporary, 'buster-state'), { recordLimits: records,
    maximumArchiveBytes: 4 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
    trustedSourceAuthority: 'nova:coverage', sourceAttestationPublicKey: publicKey });
  const service = new BusterRemotePlanService({ store, registry, workerRevision: 'a'.repeat(40),
    runtimeRoot: path.join(temporary, 'buster-runs'), tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 16 * 1024 * 1024,
    allowedCapabilities: new Set() });
  const token = 'coverage-native-http-token-00000000000000';
  const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
    maximumRequestBytes: 8 * 1024 * 1024, maximumResponseBytes: 65536,
    maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 5000 });
  try {
    const address = await runtime.start();
    const gate = createProductionNovaTestGate({ stateRoot: path.join(temporary, 'nova-state'),
      endpoint: `http://127.0.0.1:${address.port}`, token, sourceAuthority: 'nova:coverage', sourceAttestationPrivateKey: privateKey,
      pollMilliseconds: 10, maximumResponseBytes: 65536, maximumResultBytes: 16 * 1024 * 1024,
      maximumArchiveBytes: 4 * 1024 * 1024, maximumArchiveStoreBytes: 16 * 1024 * 1024,
      maximumEvidenceBytes: 4 * 1024 * 1024, maximumEvidenceStoreBytes: 16 * 1024 * 1024, recordLimits: records });
    const limits = { cpuMillis: 30000, memoryBytes: 536870912, logBytes: 1048576, artifactBytes: 1048576, artifactFiles: 16, processes: 16 };
    for (const required of [null, 'optional', 'missing']) {
      const unsigned = { schemaVersion: 'gate-coverage.v1' as const, projectId: 'coverage', kind: 'module' as const,
        baseRevision: revision, modules: [{ moduleId: 'api', ownedPaths: ['api'], requirements: [{ id: 'works', statement: 'API must execute its check.' }] }],
        integrationRequirements: [], requiredChecks: [{ checkId: 'required', requirementRefs: [{ moduleId: 'api', requirementId: 'works' }], nodeIds: [required ?? 'optional'] }] };
      const coverage: GateCoverageV1 = { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
      const plan = resolveTestPlan({ planId: `plan:${required ?? 'standalone'}`, runId: 'run:coverage', project: 'coverage',
        scope: { moduleId: 'api', gateId: null }, createdAt: '2026-09-09T00:00:00Z', registry, suiteTemplates: [],
        declaration: { ...(required ? { coverage } : {}), tests: { optional: { uses: 'kubeclaw.direct-command@1',
          config: { executable: 'node', args: ['--test'], resultMode: 'exit-code' }, when: { changedPaths: ['absent/**'] } } } },
        facts: { changedPaths: [], moduleType: null, pipelineStage: null }, policy: { defaultTimeoutMs: 30000,
          maximumTimeoutMs: 30000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1,
          maximumMatrixSize: 4, maximumNodes: 8, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: {} } });
      const executed = await gate.execute({ idempotencyKey: `coverage:${required ?? 'standalone'}`, pipelineStageId: 'test-api', plan,
        repositoryRoot: repository, repositoryId: 'coverage', revision, grants: new Map([['optional', []]]),
        maximumConcurrency: 1, submittedAt: '2026-09-09T00:00:00Z', timeoutMs: 30000 });
      const decision = parseGateDecision(executed.remote.decision);
      assert.equal(executed.remote.status.state, 'completed', JSON.stringify(executed.remote.status));
      assert.equal(decision.nodes[0]?.effect, 'skipped');
      if (required) {
        assert.equal(decision.state, 'failed');
        assert.equal(decision.coverage?.sourceRevision, `git:${revision}`);
        assert.equal(decision.coverage?.planDigest, plan.planDigest);
        assert.equal(decision.coverage?.checks[0]?.state, required === 'missing' ? 'missing' : 'skipped');
      } else {
        assert.equal(decision.state, 'passed', 'standalone optional-skip semantics remain; this is no completeness certification');
        assert.equal(decision.coverage, undefined);
      }
    }
  } finally { await runtime.stop(); fs.rmSync(temporary, { recursive: true, force: true }); }
});
