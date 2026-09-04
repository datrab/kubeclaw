import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { BusterRemotePlanRuntime, BusterRemotePlanService, FileBusterPlanJobStore } from '@kubeclaw/buster-engine';

const buildkitHost = process.env.CONTAINER_BUILD_BUILDKIT_HOST;
const registryReference = process.env.CONTAINER_BUILD_REGISTRY_REFERENCE;
const registryBaseUrl = process.env.CONTAINER_BUILD_REGISTRY_BASE_URL;
if (!buildkitHost || !registryReference || !registryBaseUrl) {
  throw new Error('CONTAINER_BUILD_LIVE_CONFIGURATION_REQUIRED');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'container-build-production-'));
const repository = path.join(root, 'repository');
const busterState = path.join(root, 'buster-state');
const busterRuns = path.join(root, 'buster-runs');
const token = 'container-build-production-token-0000000000';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const privateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };
const limits = { cpuMillis: 120_000, memoryBytes: 1024 * 1024 * 1024, logBytes: 8 * 1024 * 1024,
  artifactBytes: 1024 * 1024, artifactFiles: 8, processes: 32 };

try {
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\nCOPY payload.txt /payload.txt\n');
  fs.writeFileSync(path.join(repository, 'payload.txt'), 'real container build proof\n');
  execFileSync('git', ['init', '-q'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'container-build@example.invalid'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Container Build Proof'], { cwd: repository });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'real build fixture'], { cwd: repository });

  const pluginRoot = path.resolve('skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'container-build-production',
  } }));
  const suite = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/suites/container-build.v1.json', 'utf8'));
  const declaration: any = JSON.parse(fs.readFileSync(
    'contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json', 'utf8'));
  const outputName = `suite3-${crypto.randomBytes(8).toString('hex')}`;
  declaration.suites['container-build'].add['application-image'].config.outputName = outputName;
  declaration.suites['container-build'].add['application-image'].retries = 1;
  const plan = resolveTestPlan({ planId: `plan:container-build:${outputName}`, runId: `run:container-build:${outputName}`,
    project: 'container-build-production', scope: { moduleId: 'app', gateId: null },
    createdAt: new Date().toISOString(), declaration, suiteTemplates: [suite], registry,
    facts: { changedPaths: ['Dockerfile', 'payload.txt'], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 120_000, maximumTimeoutMs: 600_000, defaultLimits: limits,
      maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
      defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'container-build': 1 } } });

  const makeService = () => new BusterRemotePlanService({
    store: new FileBusterPlanJobStore(busterState, { recordLimits: records, maximumArchiveBytes: 16 * 1024 * 1024,
      maximumResultBytes: 16 * 1024 * 1024, maximumResultStoreBytes: 64 * 1024 * 1024,
      trustedSourceAuthority: 'nova:production', sourceAttestationPublicKey: publicKey }),
    registry, workerRevision: 'a'.repeat(40), runtimeRoot: busterRuns, tarExecutable: '/usr/bin/tar', maximumExtractedBytes: 64 * 1024 * 1024,
    allowedCapabilities: new Set(['container.build']), containerBuild: {
      buildctlExecutable: '/usr/local/bin/buildctl', buildkitHost,
      registryBaseUrl, registryReference, repositoryPrefix: 'kubeclaw/pipeline',
      allowedPlatforms: ['linux/amd64'], allowedBuildArguments: [], maximumLogBytes: 8 * 1024 * 1024,
      maximumExecutionMs: 600_000, maximumManifestBytes: 16 * 1024 * 1024,
    },
  });
  const start = async (service: BusterRemotePlanService) => {
    const runtime = new BusterRemotePlanRuntime({ service, host: '127.0.0.1', port: 0, token,
      maximumRequestBytes: 32 * 1024 * 1024, maximumResponseBytes: 1024 * 1024,
      maximumResultBytes: 16 * 1024 * 1024, shutdownTimeoutMs: 10_000 });
    const address = await runtime.start();
    return { runtime, endpoint: `http://127.0.0.1:${address.port}` };
  };
  const nova = (endpoint: string) => createProductionNovaTestGate({ stateRoot: path.join(root, 'nova-state'), endpoint,
    token, sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey, pollMilliseconds: 20,
    maximumResponseBytes: 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
    maximumArchiveBytes: 16 * 1024 * 1024, maximumArchiveStoreBytes: 64 * 1024 * 1024,
    maximumEvidenceBytes: 16 * 1024 * 1024, maximumEvidenceStoreBytes: 64 * 1024 * 1024,
    recordLimits: records,
  });
  let service = makeService();
  let running = await start(service);
  const execution = await nova(running.endpoint).execute({ idempotencyKey: `container-build:${outputName}`,
    pipelineStageId: 'stage:container-build', plan, repositoryRoot: repository,
    repositoryId: 'repository:container-build', grants: new Map([[plan.nodes[0]!.id, ['container.build']]]),
    maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 660_000 });
  const resultRef = execution.remote.status.result!;
  const result = JSON.parse((await service.result(execution.remote.status.jobId,
    resultRef.contentDigest, resultRef.sizeBytes)).toString('utf8'));
  assert.equal(execution.remote.decision.state, 'passed', JSON.stringify({ remote: execution.remote, result }));
  const image = result.attempts[0]?.outputs.find((output: any) => output.name === 'image')?.value;
  assert.match(String(image?.digest), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(image?.reference, `${registryReference}/kubeclaw/pipeline/${outputName}@${image.digest}`);
  const manifest = await fetch(`${registryBaseUrl}/v2/kubeclaw/pipeline/${outputName}/manifests/${image.digest}`, {
    headers: { Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
  });
  assert.equal(manifest.ok, true);
  const manifestBytes = Buffer.from(await manifest.arrayBuffer());
  assert.equal(`sha256:${crypto.createHash('sha256').update(manifestBytes).digest('hex')}`, image.digest);
  assert.equal(manifest.headers.get('docker-content-digest'), image.digest);

  await running.runtime.stop();
  service = makeService();
  running = await start(service);
  assert.equal((await service.status(execution.remote.status.jobId)).state, 'completed');
  assert.deepEqual(await service.result(execution.remote.status.jobId, resultRef.contentDigest, resultRef.sizeBytes),
    Buffer.from(JSON.stringify(result)));

  fs.writeFileSync(path.join(repository, 'Dockerfile'), 'FROM scratch\nRUN this-command-cannot-exist\n');
  execFileSync('git', ['add', 'Dockerfile'], { cwd: repository });
  execFileSync('git', ['commit', '-qm', 'invalid build fixture'], { cwd: repository });
  const failedName = `${outputName}-failed`;
  const failedDeclaration = structuredClone(declaration);
  failedDeclaration.suites['container-build'].add['application-image'].config.outputName = failedName;
  const failedPlan = resolveTestPlan({ planId: `plan:container-build:${failedName}`,
    runId: `run:container-build:${failedName}`, project: 'container-build-production',
    scope: { moduleId: 'app', gateId: null }, createdAt: new Date().toISOString(),
    declaration: failedDeclaration, suiteTemplates: [suite], registry,
    facts: { changedPaths: ['Dockerfile'], moduleType: 'service', pipelineStage: 'test' },
    policy: { defaultTimeoutMs: 120_000, maximumTimeoutMs: 600_000, defaultLimits: limits,
      maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 4, maximumNodes: 8,
      defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'container-build': 1 } } });
  const failed = await nova(running.endpoint).execute({ idempotencyKey: `container-build:${failedName}`,
    pipelineStageId: 'stage:container-build-failure', plan: failedPlan, repositoryRoot: repository,
    repositoryId: 'repository:container-build', grants: new Map([[failedPlan.nodes[0]!.id, ['container.build']]]),
    maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 660_000 });
  assert.equal(failed.remote.decision.state, 'failed');
  const failedRef = failed.remote.status.result!;
  const failedResult = JSON.parse((await service.result(failed.remote.status.jobId,
    failedRef.contentDigest, failedRef.sizeBytes)).toString('utf8'));
  assert.equal(failedResult.attempts.length, 2);
  assert.deepEqual(failedResult.attempts.map((attempt: any) => attempt.outcome), ['failed', 'failed']);
  await running.runtime.stop();

  console.log(JSON.stringify({ ok: true, phase: 'container-build-production', boundary: 'nova-to-buster-remote',
    realComponents: ['git-snapshot', 'http-runtime', 'remote-job-store', 'provider-process',
      'buildctl', 'buildkit-daemon', 'registry-push', 'registry-manifest', 'nova-result-import', 'restart-recovery'],
    image: image.reference, failedBuildAttempts: 2, mocks: 0, fakes: 0, emulators: 0, wrappers: 0 }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
