#!/usr/bin/env node
import assert from 'node:assert/strict';
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

const IMMUTABLE_IMAGE = /^(?:[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;
const token = process.env.BUSTER_V2_TOKEN;
const privateKey = process.env.BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY;
const immutableImage = process.env.KUBECLAW_TAILSCALE_PREFLIGHT_IMAGE;
const expectedText = process.env.KUBECLAW_TAILSCALE_PREFLIGHT_EXPECTED_TEXT;

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const runtimeRevision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
  cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-tailscale-preflight-'));
const fixture = path.join(temporary, 'fixture');
const state = path.join(temporary, 'nova-state');
const runId = `run:tailscale-preflight:${crypto.randomUUID()}`;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function readRecords(relative: string): any[] {
  const value = JSON.parse(fs.readFileSync(path.join(state, relative, 'records', 'store.json'), 'utf8'));
  assert.equal(value.schemaVersion, 'pipeline-durable-record-store.v1');
  assert.equal(Array.isArray(value.records), true);
  return value.records;
}

try {
  if (!token) throw new Error('TAILSCALE_PREFLIGHT_TOKEN_MISSING');
  if (!privateKey) throw new Error('TAILSCALE_PREFLIGHT_SOURCE_KEY_MISSING');
  const image = immutableImage ? IMMUTABLE_IMAGE.exec(immutableImage) : null;
  if (!image) throw new Error('TAILSCALE_PREFLIGHT_IMMUTABLE_IMAGE_INVALID');
  const imageDigest = image[1]!;
  const route = resolveProviderCapability(parseCapabilityProviders(), 'buster', 'test.plan.execute');
  if (route.adapter !== 'buster-plan-v1') throw new Error(`TAILSCALE_PREFLIGHT_PROVIDER_UNSUPPORTED:${route.adapter}`);

  fs.mkdirSync(path.join(fixture, 'k8s'), { recursive: true });
  fs.mkdirSync(path.join(fixture, '.swarm'), { recursive: true });
  fs.writeFileSync(path.join(fixture, '.swarm', '.gitkeep'), '');
  fs.writeFileSync(path.join(fixture, 'k8s', 'deployment.yaml'), [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: tailscale-preflight',
    '  labels:',
    '    app.kubernetes.io/name: tailscale-preflight',
    'spec:',
    '  replicas: 1',
    '  selector:',
    '    matchLabels:',
    '      app.kubernetes.io/name: tailscale-preflight',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app.kubernetes.io/name: tailscale-preflight',
    '    spec:',
    '      securityContext:',
    '        runAsNonRoot: true',
    '        seccompProfile:',
    '          type: RuntimeDefault',
    '      containers:',
    '        - name: web',
    `          image: ${immutableImage}`,
    '          ports:',
    '            - name: http',
    '              containerPort: 8080',
    '          resources:',
    '            requests: { cpu: 10m, memory: 32Mi }',
    '            limits: { cpu: 100m, memory: 128Mi }',
    '          readinessProbe:',
    '            httpGet: { path: /, port: http }',
    '            periodSeconds: 2',
    '            failureThreshold: 60',
    '          securityContext:',
    '            runAsNonRoot: true',
    '            allowPrivilegeEscalation: false',
    '            capabilities: { drop: [ALL] }',
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: tailscale-preflight',
    'spec:',
    '  type: ClusterIP',
    '  selector:',
    '    app.kubernetes.io/name: tailscale-preflight',
    '  ports:',
    '    - name: http',
    '      port: 80',
    '      targetPort: http',
    '',
  ].join('\n'));
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'KubeClaw Nova Preflight');
  git('config', 'user.email', 'nova-preflight@kubeclaw.invalid');
  git('add', '.');
  git('commit', '-qm', 'Create Tailscale production preflight fixture');

  const pluginRoot = path.join(repositoryRoot, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'tailscale-production-preflight',
  } }));
  const declaration: any = {
    tests: {
      'checked-manifest': { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0,
        concurrencyGroup: 'manifest', config: { executable: 'cp',
          args: ['k8s/deployment.yaml', '.swarm/checked-tailscale-preflight.yaml'], workingDirectory: '.',
          resultMode: 'exit-code', artifacts: [{ id: 'checked-manifest',
            path: '.swarm/checked-tailscale-preflight.yaml',
            mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' }] } },
      'public-http-health': { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 0,
        needs: ['tailscale-exposure'], concurrencyGroup: 'http', config: { path: '/', expectedStatuses: [200],
          ...(expectedText ? { expectedText } : {}), requestTimeoutMs: 20_000 },
        inputs: { endpoint: { from: 'tailscale-exposure', output: 'exposure' } } },
    },
    fixtures: {
      'kubernetes-deployment': { uses: 'kubeclaw.kubernetes-fixture@1', retries: 0,
        needs: ['checked-manifest'], concurrencyGroup: 'kubernetes-fixture',
        config: { image: { reference: immutableImage, digest: imageDigest }, serviceName: 'tailscale-preflight',
          servicePort: 80, namespacePrefix: 'test', retention: { mode: 'delete', seconds: 600 },
          readinessTimeoutSeconds: 300, secretReferences: [] }, inputs: {
          'checked-manifest': { from: 'checked-manifest', output: 'artifact-1',
            mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' },
        } },
      'tailscale-exposure': { uses: 'kubeclaw.tailscale-exposure@1', retries: 0,
        needs: ['kubernetes-deployment'], concurrencyGroup: 'tailscale-exposure',
        config: { path: '/', readinessTimeoutSeconds: 300 }, inputs: {
          deployment: { from: 'kubernetes-deployment', output: 'deployment' },
        } },
    },
    concurrencyLimits: { manifest: 1, 'kubernetes-fixture': 1, 'tailscale-exposure': 1, http: 1 },
  };
  const limits = { cpuMillis: 600_000, memoryBytes: 1024 * 1024 * 1024,
    logBytes: 4 * 1024 * 1024, artifactBytes: 16 * 1024 * 1024, artifactFiles: 32, processes: 32 };
  const plan = resolveTestPlan({ planId: 'plan:tailscale:production-preflight', runId,
    project: 'tailscale-production-preflight', scope: { moduleId: null, gateId: 'production-preflight' },
    createdAt: new Date().toISOString(), declaration, suiteTemplates: [], registry,
    facts: { changedPaths: ['k8s/deployment.yaml'], moduleType: 'service', pipelineStage: 'preflight' },
    policy: { defaultTimeoutMs: 600_000, maximumTimeoutMs: 600_000,
      defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1, maximumMatrixSize: 1,
      maximumNodes: 4, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { manifest: 1, 'kubernetes-fixture': 1, 'tailscale-exposure': 1, http: 1 } } });
  assert.deepEqual([...plan.nodes.map((node) => node.id)].sort(),
    ['checked-manifest', 'kubernetes-deployment', 'public-http-health', 'tailscale-exposure']);
  const grants = new Map<string, readonly string[]>([
    ['checked-manifest', ['command.execute']],
    ['kubernetes-deployment', ['kubernetes.fixture']],
    ['tailscale-exposure', ['kubernetes.exposure']],
    ['public-http-health', ['network.http']],
  ]);
  const nova = createProductionNovaTestGate({ stateRoot: state, endpoint: route.endpoint, token,
    sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey,
    pollMilliseconds: 500, maximumResponseBytes: 32 * 1024 * 1024,
    maximumResultBytes: 32 * 1024 * 1024, maximumArchiveBytes: 16 * 1024 * 1024,
    maximumArchiveStoreBytes: 64 * 1024 * 1024, maximumEvidenceBytes: 16 * 1024 * 1024,
    maximumEvidenceStoreBytes: 64 * 1024 * 1024,
    recordLimits: { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024,
      maximumRecordBytes: 32 * 1024 * 1024 } });
  const result = await nova.execute({ idempotencyKey: `tailscale:${crypto.randomUUID()}`,
    pipelineStageId: 'stage:tailscale-preflight', plan, repositoryRoot: fixture,
    repositoryId: 'repository:tailscale-preflight', grants, maximumConcurrency: 1,
    submittedAt: new Date().toISOString(), timeoutMs: 720_000 });
  assert.equal(result.remote.status.state, 'completed');
  assert.equal(result.remote.decision.state, 'passed');
  assert.deepEqual(result.remote.decision.nodes.map((node) => [node.nodeId, node.effect]).sort(), [
    ['checked-manifest', 'passed'],
    ['kubernetes-deployment', 'passed'],
    ['public-http-health', 'passed'],
    ['tailscale-exposure', 'passed'],
  ]);

  const imports = readRecords('imports').filter((record) => record.stream === 'remote-gate-imports');
  assert.equal(imports.length, 1);
  assert.equal(imports[0].payload.state, 'complete');
  assert.equal(imports[0].payload.jobId, result.remote.decision.jobId);
  assert.equal(imports[0].payload.decision.decisionDigest, result.remote.decision.decisionDigest);
  assert.ok(imports[0].payload.evidenceDigests.length > 0);
  assert.equal(imports[0].payload.remoteResult.cleanupErrors.length, 0);
  const busterRuntimeRevision = imports[0].payload.remoteResult.workerRevision;
  assert.match(busterRuntimeRevision, /^[a-f0-9]{40,64}$/u);
  const outputs = imports[0].payload.remoteResult.attempts.flatMap((attempt: any) => attempt.outputs);
  const deployment = outputs.find((output: any) => output.kind === 'value'
    && output.schemaId === 'kubeclaw.kubernetes-deployment-fixture@1')?.value;
  const exposure = outputs.find((output: any) => output.kind === 'value'
    && output.schemaId === 'kubeclaw.public-endpoint-fixture@1')?.value;
  assert.ok(deployment?.leaseName && deployment?.namespace);
  assert.equal(exposure?.leaseName, deployment.leaseName);
  assert.equal(exposure?.namespace, deployment.namespace);
  assert.ok(exposure?.hostname);
  const graphs = readRecords('execution-graph').filter((record) => record.stream === 'test-execution-graphs');
  assert.equal(graphs.length, 1);
  assert.equal(graphs[0].payload.runId, runId);
  assert.equal(graphs[0].payload.planDigest, plan.planDigest);
  assert.equal(graphs[0].payload.nodes.length, 4);
  assert.equal(graphs[0].payload.results.every((node: any) => node.state === 'completed'), true);

  const receipt = { ok: true, schemaVersion: 'nova-tailscale-production-preflight.v1',
    suite: 'tailscale-preview',
    runId, jobId: result.remote.decision.jobId, provider: route, runtimeRevision,
    busterRuntimeRevision,
    fixtureRevision: git('rev-parse', 'HEAD'),
    planDigest: plan.planDigest, resultDigest: result.remote.decision.resultDigest,
    decisionDigest: result.remote.decision.decisionDigest, status: result.remote.status.state,
    decision: result.remote.decision.state, nodes: result.remote.decision.nodes.map((node) => ({
      id: node.nodeId, effect: node.effect })), evidenceDigests: imports[0].payload.evidenceDigests,
    evidenceImported: true, runnerCleanupVerified: true, cleanupVerified: false,
    clusterCleanupObserved: false,
    resources: { leaseName: deployment.leaseName, namespace: deployment.namespace, hostname: exposure.hostname },
    boundary: 'Nova signed source to remote Buster isolated provider plan',
    cleanupAuthority: 'Buster reverse cleanup waits for exposure Off and lease deletion',
    infrastructure: ['Kubernetes API', 'BusterNamespaceLease controller', 'Tailscale Kubernetes Operator',
      'MagicDNS HTTPS endpoint'], mocks: 0, emulators: 0 } as const;
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
