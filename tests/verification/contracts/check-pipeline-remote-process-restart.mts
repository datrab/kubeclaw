import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { buildCommittedSourceSnapshot, buildRegistry, createRemotePlanJob, discoverPackages } from '@kubeclaw/nova-core';
import { remotePlanJobDigest, resolvedTestPlanDigest, stableTestIdentity, type RemotePlanJobV1, type RemotePlanStatusV1, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-process-restart-'));
const installRoot = path.join(temporary, 'plugins');
const packageRoot = path.join(installRoot, 'restart-provider');
const repository = path.join(temporary, 'repository');
const tokenName = 'PHASE7_PROCESS_TOKEN';
const token = 'phase-7-process-restart-token-000000000';
const sourcePrivateKeyName = 'PHASE7_SOURCE_ATTESTATION_PRIVATE_KEY';
const sourcePublicKeyName = 'PHASE7_SOURCE_ATTESTATION_PUBLIC_KEY';
const sourceKeys = crypto.generateKeyPairSync('ed25519');
const sourceAttestationPrivateKey = sourceKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const sourceAttestationPublicKey = sourceKeys.publicKey.export({ type: 'spki', format: 'pem' });
const busterCli = path.resolve('skills/buster/engine/remote-plan-cli.ts');
const novaCli = path.resolve('skills/nova/core/test-gates/remote-gate-cli.ts');
const records = { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024, maximumRecordBytes: 16 * 1024 * 1024 };

function waitForLine(child: ChildProcessWithoutNullStreams, timeoutMs = 10_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`PROCESS_READY_TIMEOUT:${stderr}`)), timeoutMs);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const lines = readline.createInterface({ input: child.stdout });
    lines.once('line', (line) => { clearTimeout(timer); lines.close(); resolve(JSON.parse(line)); });
    child.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`PROCESS_EXITED:${code}:${signal}:${stderr}`)); });
  });
}

function closeOf(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => child.once('close', () => resolve()));
}

async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('PORT_DISCOVERY_FAILED');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function status(port: number, jobId: string): Promise<RemotePlanStatusV1 | null> {
  const response = await fetch(`http://127.0.0.1:${port}/v1/plan-jobs/${encodeURIComponent(jobId)}`,
    { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  return response?.ok ? response.json() as Promise<RemotePlanStatusV1> : null;
}

async function waitForState(port: number, jobId: string, states: readonly string[], timeoutMs = 15_000): Promise<RemotePlanStatusV1> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await status(port, jobId);
    if (current && states.includes(current.state)) return current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`REMOTE_STATE_TIMEOUT:${jobId}:${states.join(',')}`);
}

function startBuster(config: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [busterCli, '--config', config], {
    cwd: process.cwd(), env: { ...process.env, [tokenName]: token,
      [sourcePublicKeyName]: sourceAttestationPublicKey }, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function startNova(config: string, jobFile: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [novaCli, '--config', config, '--job', jobFile, '--timeout-ms', '30000'], {
    cwd: process.cwd(), env: { ...process.env, [tokenName]: token,
      [sourcePrivateKeyName]: sourceAttestationPrivateKey }, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function finishNova(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; output: Record<string, unknown> | null; stderr: string }> {
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
  return { code, output: stdout.trim() ? JSON.parse(stdout.trim()) : null, stderr };
}

try {
  fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(packageRoot, 'schemas', 'config.json'), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
    required: ['delayMs'], properties: { delayMs: { type: 'integer', minimum: 0, maximum: 30000 } },
  }));
  fs.writeFileSync(path.join(packageRoot, 'dist', 'provider.js'), `
export function provider() { return { async execute(invocation, context) {
  const fs = await import('node:fs');
  const marker = context.workspaceRoot + '/' + invocation.workspace.evidence + '/provider-count.txt';
  fs.appendFileSync(marker, 'run\\n');
  await new Promise((resolve) => setTimeout(resolve, invocation.configuration.values.delayMs));
  return { schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'restart provider passed',
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 }, findings: [], metrics: [],
    evidenceFiles: [{ evidenceId: 'count', type: 'log', file: 'provider-count.txt', mediaType: 'text/plain' }],
    reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null };
}, async cleanup() {} }; }
`);
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    id: 'phase7.restart-provider', apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0',
    stages: [], observers: [], adapters: [], testProviders: [{ id: 'restart', contractId: 'phase7.restart-provider@1',
      kind: 'test', module: 'dist/provider.js', export: 'provider', configSchema: 'schemas/config.json', inputs: [], outputs: [],
      requiredCapabilities: [], retrySafe: true, matrixFields: [], reportFormats: [], evidenceTypes: ['log'],
      evidenceDefaults: { onPass: ['log'], onFail: ['log'], onError: ['log'] } }],
  }));
  fs.writeFileSync(path.join(repository, 'README.md'), 'restart proof\n');
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'phase7@example.invalid']);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Phase 7 Proof']);
  execFileSync('git', ['-C', repository, 'add', 'README.md']);
  execFileSync('git', ['-C', repository, 'commit', '-qm', 'committed restart source']);
  const source = buildCommittedSourceSnapshot({ repositoryRoot: repository, repositoryId: 'repository:phase7-restart',
    pipelineStageId: 'stage:test-gate',
    creatorAuthority: 'nova:production', attestationPrivateKey: sourceAttestationPrivateKey,
    maximumArchiveBytes: 4 * 1024 * 1024 });
  const registry = buildRegistry(discoverPackages({ installationRoots: [installRoot], trustPolicy: {
    trustedBuiltinRoots: [installRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'phase7-restart' },
  }));
  const entry = registry.testProviderContracts.get('phase7.restart-provider@1')!;
  function plan(runId: string, delayMs: number): ResolvedTestPlanV1 {
    const unsigned = { schemaVersion: 'resolved-test-plan.v1' as const, planId: `plan:${runId}`, runId,
      project: 'phase7-restart', scope: { moduleId: 'module', gateId: null }, registrySnapshotDigest: registry.snapshotDigest,
      createdAt: '2026-08-12T07:30:00.000Z', suites: [], nodes: [{ id: 'restart', executionId: `execution:${runId}`,
        testIdentity: stableTestIdentity({ project: 'phase7-restart', moduleId: 'module', gateId: null,
          suiteInstanceId: null, nodeId: 'restart', variation: {} }),
        suiteInstanceId: null, kind: 'test' as const, provider: { packageId: entry.registration.package.packageId,
          packageVersion: entry.registration.package.packageVersion, contentDigest: entry.registration.package.contentDigest,
          registrationId: entry.registration.registrationId, contractId: entry.registration.contractId },
        reportAdapters: [], mode: 'blocking' as const, reviewAgent: null,
        configuration: { schemaVersion: 'provider-configuration.v1' as const, contractId: entry.registration.contractId,
          schemaDigest: entry.configSchemaDigest, values: { delayMs } }, dependencies: [], timeoutMs: 30_000,
        limits: { cpuMillis: 10_000, memoryBytes: 512 * 1024 * 1024, logBytes: 1024 * 1024,
          artifactBytes: 4 * 1024 * 1024, artifactFiles: 16, processes: 16 }, retryCount: 0,
        concurrencyGroup: null, parentNodeId: null, variation: {}, evidence: { onPass: ['log'], onFail: ['log'], onError: ['log'] },
        skipReason: null }], links: [], concurrencyLimits: {} };
    return { ...unsigned, planDigest: resolvedTestPlanDigest(unsigned) };
  }
  function job(runId: string, delayMs: number): RemotePlanJobV1 {
    return createRemotePlanJob({ idempotencyKey: `phase7:${runId}`, pipelineStageId: 'stage:test-gate', plan: plan(runId, delayMs),
      sourceSnapshot: source.sourceSnapshot, repositoryArchive: source.repositoryArchive,
      grants: new Map([['restart', []]]), maximumConcurrency: 1,
      submittedAt: '2026-08-12T07:30:00.000Z' });
  }
  function productionRequest(runId: string, delayMs: number) {
    return { idempotencyKey: `phase7:${runId}`, pipelineStageId: 'stage:test-gate', plan: plan(runId, delayMs),
      repositoryRoot: repository, repositoryId: 'repository:phase7-restart', revision: 'HEAD',
      grants: { restart: [] }, maximumConcurrency: 1, submittedAt: '2026-08-12T07:30:00.000Z' };
  }

  const port = await freePort();
  const platform = path.join(temporary, 'platform.json');
  fs.writeFileSync(platform, JSON.stringify({ schemaVersion: 'pipeline-platform.v2', installationRoots: [installRoot],
    trustedBuiltinRoots: [installRoot], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: {}, grants: {}, adapters: {}, activeAdapters: [], observers: {}, storageRoot: './platform-state',
    shutdownTimeoutMs: 5_000, orchestratorIssuerId: 'phase7-restart', administrativeDecisionIssuers: [] }));
  const busterConfig = path.join(temporary, 'buster.json');
  fs.writeFileSync(busterConfig, JSON.stringify({ schemaVersion: 'buster-remote-plan-runtime.v1', platformConfig: platform,
    host: '127.0.0.1', port, tokenEnvironmentVariable: tokenName,
    sourceAttestationPublicKeyEnvironmentVariable: sourcePublicKeyName,
    stateRoot: './buster-state', runtimeRoot: './buster-runs',
    trustedSourceAuthority: 'nova:production',
    tarExecutable: '/usr/bin/tar', maximumArchiveBytes: 4 * 1024 * 1024, maximumResultBytes: 16 * 1024 * 1024,
    maximumResultStoreBytes: 64 * 1024 * 1024, maximumExtractedBytes: 16 * 1024 * 1024, allowedCapabilities: [],
    maximumRequestBytes: 8 * 1024 * 1024, maximumResponseBytes: 64 * 1024, shutdownTimeoutMs: 5_000, recordLimits: records }));
  const novaConfig = path.join(temporary, 'nova.json');
  fs.writeFileSync(novaConfig, JSON.stringify({ schemaVersion: 'nova-remote-test-gate-runtime.v1',
    endpoint: `http://127.0.0.1:${port}`, tokenEnvironmentVariable: tokenName,
    sourceAttestationPrivateKeyEnvironmentVariable: sourcePrivateKeyName,
    sourceAuthority: 'nova:production', stateRoot: './nova-state',
    legacyLedgerPath: path.resolve('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json'), pollMilliseconds: 25,
    maximumResponseBytes: 64 * 1024, maximumResultBytes: 16 * 1024 * 1024, maximumArchiveBytes: 4 * 1024 * 1024,
    maximumArchiveStoreBytes: 16 * 1024 * 1024, maximumEvidenceBytes: 4 * 1024 * 1024,
    maximumEvidenceStoreBytes: 16 * 1024 * 1024, recordLimits: records }));

  let buster = startBuster(busterConfig);
  await waitForLine(buster);
  const reconnectJob = job('run:nova-restart', 1500);
  const invalidUnsigned = { ...reconnectJob, sourceSnapshot: { ...reconnectJob.sourceSnapshot,
    archiveSizeBytes: reconnectJob.sourceSnapshot.archiveSizeBytes + 1 } };
  const { requestDigest: _invalidDigest, ...invalidContent } = invalidUnsigned;
  const invalidResponse = await fetch(`http://127.0.0.1:${port}/v1/plan-jobs`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...invalidContent, requestDigest: remotePlanJobDigest(invalidContent) }) });
  assert.equal(invalidResponse.status, 400, 'Buster must reject a source statement that does not bind the archive');
  const forgedUnsigned = { ...reconnectJob, sourceSnapshot: { ...reconnectJob.sourceSnapshot,
    tree: `git:${'c'.repeat(40)}` } };
  const { requestDigest: _forgedDigest, ...forgedContent } = forgedUnsigned;
  const forgedResponse = await fetch(`http://127.0.0.1:${port}/v1/plan-jobs`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...forgedContent, requestDigest: remotePlanJobDigest(forgedContent) }) });
  assert.equal(forgedResponse.status, 400,
    'Buster must reject a self-consistent request with a forged committed-source statement');
  const reconnectFile = path.join(temporary, 'reconnect-job.json');
  fs.writeFileSync(reconnectFile, JSON.stringify(productionRequest('run:nova-restart', 1500)));
  const firstNova = startNova(novaConfig, reconnectFile);
  let firstNovaError = '';
  firstNova.stderr.on('data', (chunk) => { firstNovaError += chunk.toString(); });
  const firstState = await Promise.race([
    waitForState(port, reconnectJob.jobId, ['running', 'completed']),
    new Promise<never>((_resolve, reject) => firstNova.once('exit', (code, signal) =>
      reject(new Error(`NOVA_EXITED_BEFORE_SUBMIT:${code}:${signal}:${firstNovaError}`)))),
  ]);
  assert.ok(firstState);
  firstNova.kill('SIGKILL');
  await closeOf(firstNova);
  await waitForState(port, reconnectJob.jobId, ['completed']);
  const restartedNova = await finishNova(startNova(novaConfig, reconnectFile));
  assert.equal(restartedNova.code, 0, JSON.stringify(restartedNova));
  const novaResult = restartedNova.output as { remote?: { decision?: { state?: string } } };
  assert.equal(novaResult.remote?.decision?.state, 'passed');
  const graphState = fs.readFileSync(path.join(temporary, 'nova-state', 'execution-graph', 'records', 'store.json'), 'utf8');
  assert.match(graphState, /nova-test-execution-graph\.v1/u, 'Nova restart must retain the canonical test subgraph');
  assert.match(graphState, new RegExp(reconnectJob.plan.nodes[0]!.testIdentity, 'u'));
  const busterState = fs.readFileSync(path.join(temporary, 'buster-state', 'records', 'store.json'), 'utf8');
  assert.match(busterState, new RegExp(reconnectJob.sourceSnapshot.revision, 'u'),
    'Buster restart state must retain the committed source identity');
  const jobRoot = path.join(temporary, 'buster-runs', crypto.createHash('sha256').update(reconnectJob.jobId).digest('hex'));
  const marker = execFileSync('find', [jobRoot, '-name', 'provider-count.txt', '-type', 'f'], { encoding: 'utf8' }).trim();
  assert.ok(marker);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'run\n', 'Nova restart must not execute the provider twice');

  const busterRestartJob = job('run:buster-restart', 10_000);
  const busterRestartFile = path.join(temporary, 'buster-restart-job.json');
  fs.writeFileSync(busterRestartFile, JSON.stringify(productionRequest('run:buster-restart', 10_000)));
  const interruptedNova = startNova(novaConfig, busterRestartFile);
  await waitForState(port, busterRestartJob.jobId, ['running', 'completed']);
  buster.kill('SIGKILL');
  await closeOf(buster);
  interruptedNova.kill('SIGKILL');
  await closeOf(interruptedNova);
  buster = startBuster(busterConfig);
  await waitForLine(buster);
  const recovered = await waitForState(port, busterRestartJob.jobId, ['failed']);
  assert.equal(recovered.error, 'BUSTER_REMOTE_EXECUTION_INTERRUPTED');
  const restartedAfterBuster = await finishNova(startNova(novaConfig, busterRestartFile));
  assert.equal(restartedAfterBuster.code, 1);
  const recoveredResult = restartedAfterBuster.output as { remote?: { decision?: { state?: string } } };
  assert.equal(recoveredResult.remote?.decision?.state, 'execution_error');
  buster.kill('SIGTERM');
  await closeOf(buster);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, phase: '7-process-restart', nova: 'reconnect', buster: 'recover-before-ready', duplicates: 0 }));
