#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry,
  createProductionNovaTestGate,
  discoverPackages,
  resolveTestPlan,
} from '@kubeclaw/nova-core';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-container-build-preflight-'));
const fixture = path.join(temporary, 'fixture');
const state = path.join(temporary, 'nova-state');
const runId = `run:container-build-preflight:${crypto.randomUUID()}`;
const token = process.env.BUSTER_V2_TOKEN;
const privateKey = process.env.BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY;
const runtimeRevision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function records(relative: string): any[] {
  const value = JSON.parse(fs.readFileSync(path.join(state, relative, 'records', 'store.json'), 'utf8'));
  if (value.schemaVersion !== 'pipeline-durable-record-store.v1' || !Array.isArray(value.records)) {
    throw new Error('CONTAINER_BUILD_PREFLIGHT_RECORD_STORE_INVALID');
  }
  return value.records;
}

try {
  if (!token) throw new Error('CONTAINER_BUILD_PREFLIGHT_TOKEN_MISSING');
  if (!privateKey) throw new Error('CONTAINER_BUILD_PREFLIGHT_SOURCE_KEY_MISSING');
  const route = resolveProviderCapability(parseCapabilityProviders(), 'buster', 'test.plan.execute');
  if (route.adapter !== 'buster-plan-v1') throw new Error(`CONTAINER_BUILD_PREFLIGHT_PROVIDER_UNSUPPORTED:${route.adapter}`);

  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'Dockerfile'), [
    'FROM docker.io/library/nginx:1.27-alpine',
    'COPY index.html /usr/share/nginx/html/index.html',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(fixture, 'index.html'),
    `<!doctype html><title>KubeClaw container build proof</title><p>${runId}</p>\n`);
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'KubeClaw Nova Preflight');
  git('config', 'user.email', 'nova-preflight@kubeclaw.invalid');
  git('add', '.');
  git('commit', '-qm', 'Create container build preflight fixture');

  const pluginRoot = path.join(repositoryRoot, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'container-build-production-preflight',
  } }));
  const declaration = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json'), 'utf8'));
  const template = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'contracts/pipeline-test-gate/v1/suites/container-build.v1.json'), 'utf8'));
  const limits = { cpuMillis: 900_000, memoryBytes: 4 * 1024 * 1024 * 1024,
    logBytes: 8 * 1024 * 1024, artifactBytes: 16 * 1024 * 1024,
    artifactFiles: 16, processes: 128 };
  const plan = resolveTestPlan({ planId: 'plan:container-build:production-preflight', runId,
    project: 'container-build-production-preflight', scope: { moduleId: 'application', gateId: null },
    createdAt: new Date().toISOString(), declaration, suiteTemplates: [template], registry,
    facts: { changedPaths: ['Dockerfile', 'index.html'], moduleType: 'container', pipelineStage: 'preflight' },
    policy: { defaultTimeoutMs: 900_000, maximumTimeoutMs: 900_000,
      defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 2,
      maximumNodes: 4, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { 'container-build': 1 } } });
  const nova = createProductionNovaTestGate({ stateRoot: state, endpoint: route.endpoint, token,
    sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey,
    pollMilliseconds: 500, maximumResponseBytes: 64 * 1024 * 1024,
    maximumResultBytes: 64 * 1024 * 1024, maximumArchiveBytes: 16 * 1024 * 1024,
    maximumArchiveStoreBytes: 64 * 1024 * 1024, maximumEvidenceBytes: 16 * 1024 * 1024,
    maximumEvidenceStoreBytes: 64 * 1024 * 1024,
    recordLimits: { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024,
      maximumRecordBytes: 16 * 1024 * 1024 } });
  const result = await nova.execute({ idempotencyKey: `container-build:${crypto.randomUUID()}`,
    pipelineStageId: 'stage:container-build-preflight', plan, repositoryRoot: fixture,
    repositoryId: 'repository:container-build-preflight',
    grants: new Map(plan.nodes.map((node) => [node.id, ['container.build']])),
    maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 1_020_000 });
  if (result.remote.decision.state !== 'passed' || result.remote.status.state !== 'completed') {
    throw new Error(`CONTAINER_BUILD_PREFLIGHT_FAILED:${JSON.stringify(result.remote)}`);
  }
  const imports = records('imports').filter((record) => record.stream === 'remote-gate-imports');
  if (imports.length !== 1 || imports[0].payload.state !== 'complete'
    || imports[0].payload.jobId !== result.remote.decision.jobId
    || imports[0].payload.decision.decisionDigest !== result.remote.decision.decisionDigest
    || !Array.isArray(imports[0].payload.evidenceDigests)
    || imports[0].payload.evidenceDigests.length < 1
    || imports[0].payload.remoteResult.cleanupErrors.length !== 0) {
    throw new Error('CONTAINER_BUILD_PREFLIGHT_EVIDENCE_IMPORT_INVALID');
  }
  const imported = imports[0].payload;
  const output = imported.remoteResult.attempts.flatMap((attempt: any) => attempt.outputs)
    .find((entry: any) => entry.kind === 'value' && entry.schemaId === 'kubeclaw.container-image@1')?.value;
  if (output?.schemaVersion !== 'container-image.v1'
    || !/^sha256:[a-f0-9]{64}$/u.test(output.digest ?? '')
    || typeof output.reference !== 'string' || !output.reference.endsWith(`@${output.digest}`)) {
    throw new Error('CONTAINER_BUILD_PREFLIGHT_IMAGE_EVIDENCE_INVALID');
  }
  const graphs = records('execution-graph').filter((record) => record.stream === 'test-execution-graphs');
  if (graphs.length !== 1 || graphs[0].payload.planDigest !== plan.planDigest
    || !graphs[0].payload.results.every((node: any) => node.state === 'completed')) {
    throw new Error('CONTAINER_BUILD_PREFLIGHT_EXECUTION_GRAPH_INVALID');
  }
  process.stdout.write(`${JSON.stringify({ ok: true,
    schemaVersion: 'nova-container-build-production-preflight.v4', suite: 'build', runId,
    jobId: result.remote.decision.jobId, provider: route, runtimeRevision,
    busterRuntimeRevision: imported.remoteResult.workerRevision,
    fixtureRevision: git('rev-parse', 'HEAD'), planDigest: plan.planDigest,
    resultDigest: result.remote.decision.resultDigest,
    decisionDigest: result.remote.decision.decisionDigest,
    status: result.remote.status.state, decision: result.remote.decision.state,
    evidenceDigests: imported.evidenceDigests, evidenceImported: true,
    runnerCleanupVerified: true, clusterCleanupNotApplicable: true,
    immutableImage: output.reference, imageDigest: output.digest,
    registryPushVerified: true, manifestVerified: true, mocks: 0, emulators: 0 }, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
