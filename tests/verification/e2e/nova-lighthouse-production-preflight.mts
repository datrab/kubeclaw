#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry, createProductionNovaTestGate, discoverPackages, resolveTestPlan } from '@kubeclaw/nova-core';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const IMMUTABLE_IMAGE = /^(?:[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._\/-][a-z0-9]+)*)@(sha256:[a-f0-9]{64})$/u;
const token = process.env.BUSTER_V2_TOKEN;
const privateKey = process.env.BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY;
const immutableImage = process.env.KUBECLAW_LIGHTHOUSE_PREFLIGHT_IMAGE;
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const runtimeRevision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-lighthouse-preflight-'));
const fixture = path.join(temporary, 'fixture'); const state = path.join(temporary, 'nova-state');
const runId = `run:lighthouse-preflight:${crypto.randomUUID()}`;
const git = (...args: string[]) => execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
const records = (relative: string): any[] => JSON.parse(fs.readFileSync(path.join(state, relative, 'records', 'store.json'), 'utf8')).records;

try {
  if (!token) throw new Error('LIGHTHOUSE_PREFLIGHT_TOKEN_MISSING');
  if (!privateKey) throw new Error('LIGHTHOUSE_PREFLIGHT_SOURCE_KEY_MISSING');
  const image = immutableImage ? IMMUTABLE_IMAGE.exec(immutableImage) : null;
  if (!image) throw new Error('LIGHTHOUSE_PREFLIGHT_IMMUTABLE_IMAGE_INVALID');
  const route = resolveProviderCapability(parseCapabilityProviders(), 'buster', 'test.plan.execute');
  if (route.adapter !== 'buster-plan-v1') throw new Error(`LIGHTHOUSE_PREFLIGHT_PROVIDER_UNSUPPORTED:${route.adapter}`);
  fs.mkdirSync(path.join(fixture, 'k8s'), { recursive: true }); fs.mkdirSync(path.join(fixture, '.swarm'), { recursive: true });
  fs.writeFileSync(path.join(fixture, '.swarm', 'lighthouse-settings.json'), JSON.stringify({
    schemaVersion: 'kubeclaw.lighthouse-settings.v1', profiles: { production: { formFactor: 'desktop',
      screen: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } },
    budgets: { preflight: { minimumScore: 20, maximumLcpMs: 120000, maximumCls: 10, maximumTbtMs: 120000 } },
  }, null, 2));
  fs.writeFileSync(path.join(fixture, 'k8s', 'deployment.yaml'), [
    'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: lighthouse-preflight',
    '  labels: { app.kubernetes.io/name: lighthouse-preflight }', 'spec:', '  replicas: 1',
    '  selector:', '    matchLabels: { app.kubernetes.io/name: lighthouse-preflight }', '  template:',
    '    metadata:', '      labels: { app.kubernetes.io/name: lighthouse-preflight }', '    spec:',
    '      securityContext:', '        runAsNonRoot: true', '        seccompProfile: { type: RuntimeDefault }',
    '      containers:', '        - name: web', `          image: ${immutableImage}`, '          ports:',
    '            - { name: http, containerPort: 8080 }', '          resources:',
    '            requests: { cpu: 50m, memory: 64Mi }', '            limits: { cpu: 250m, memory: 256Mi }',
    '          readinessProbe:', '            httpGet: { path: /, port: http }', '            periodSeconds: 2',
    '            failureThreshold: 60', '          securityContext:', '            runAsNonRoot: true',
    '            allowPrivilegeEscalation: false', '            capabilities: { drop: [ALL] }', '---',
    'apiVersion: v1', 'kind: Service', 'metadata:', '  name: lighthouse-preflight', 'spec:', '  type: ClusterIP',
    '  selector: { app.kubernetes.io/name: lighthouse-preflight }', '  ports:',
    '    - { name: http, port: 80, targetPort: http }', '',
  ].join('\n'));
  git('init', '-q', '--initial-branch=main'); git('config', 'user.name', 'KubeClaw Nova Preflight');
  git('config', 'user.email', 'nova-preflight@kubeclaw.invalid'); git('add', '.'); git('commit', '-qm', 'Create Lighthouse production preflight fixture');

  const pluginRoot = path.join(repositoryRoot, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'lighthouse-production-preflight',
  } }));
  const declaration: any = { tests: {
    'checked-manifest': { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0, concurrencyGroup: 'manifest',
      config: { executable: 'cp', args: ['k8s/deployment.yaml', '.swarm/checked-lighthouse-preflight.yaml'], workingDirectory: '.',
        resultMode: 'exit-code', artifacts: [{ id: 'checked-manifest', path: '.swarm/checked-lighthouse-preflight.yaml',
          mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' }] } },
    performance: { uses: 'kubeclaw.lighthouse@1', mode: 'blocking', retries: 0,
      needs: ['kubernetes-deployment'], concurrencyGroup: 'lighthouse', config: { purpose: 'performance', routes: ['/'],
        settingsFile: '.swarm/lighthouse-settings.json', profile: 'production', budget: 'preflight', runs: 3, timeoutMs: 180000 },
      inputs: { deployment: { from: 'kubernetes-deployment', output: 'deployment' } } },
  }, fixtures: { 'kubernetes-deployment': { uses: 'kubeclaw.kubernetes-fixture@1', retries: 0,
    needs: ['checked-manifest'], concurrencyGroup: 'kubernetes-fixture', config: { image: { reference: immutableImage, digest: image[1] },
      serviceName: 'lighthouse-preflight', servicePort: 80, namespacePrefix: 'test', retention: { mode: 'delete', seconds: 600 },
      readinessTimeoutSeconds: 300, secretReferences: [] }, inputs: { 'checked-manifest': { from: 'checked-manifest',
        output: 'artifact-1', mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' } } } },
    concurrencyLimits: { manifest: 1, 'kubernetes-fixture': 1, lighthouse: 1 } };
  const limits = { cpuMillis: 900_000, memoryBytes: 2 * 1024 * 1024 * 1024, logBytes: 4 * 1024 * 1024,
    artifactBytes: 96 * 1024 * 1024, artifactFiles: 64, processes: 64 };
  const plan = resolveTestPlan({ planId: 'plan:lighthouse:production-preflight', runId, project: 'lighthouse-production-preflight',
    scope: { moduleId: null, gateId: 'production-preflight' }, createdAt: new Date().toISOString(), declaration,
    suiteTemplates: [], registry, facts: { changedPaths: ['k8s/deployment.yaml', '.swarm/lighthouse-settings.json'],
      moduleType: 'service', pipelineStage: 'preflight' }, policy: { defaultTimeoutMs: 900_000,
      maximumTimeoutMs: 900_000, defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 1,
      maximumMatrixSize: 1, maximumNodes: 3, defaultConcurrencyLimit: 1,
      maximumConcurrencyLimits: { manifest: 1, 'kubernetes-fixture': 1, lighthouse: 1 } } });
  const grants = new Map<string, readonly string[]>([['checked-manifest', ['command.execute']],
    ['kubernetes-deployment', ['kubernetes.fixture']], ['performance', ['browser.lighthouse']]]);
  const nova = createProductionNovaTestGate({ stateRoot: state, endpoint: route.endpoint, token,
    sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey, pollMilliseconds: 500,
    maximumResponseBytes: 128 * 1024 * 1024, maximumResultBytes: 128 * 1024 * 1024,
    maximumArchiveBytes: 16 * 1024 * 1024, maximumArchiveStoreBytes: 64 * 1024 * 1024,
    maximumEvidenceBytes: 96 * 1024 * 1024, maximumEvidenceStoreBytes: 256 * 1024 * 1024,
    recordLimits: { maximumRecords: 100, maximumBytes: 256 * 1024 * 1024, maximumRecordBytes: 128 * 1024 * 1024 } });
  const result = await nova.execute({ idempotencyKey: `lighthouse:${crypto.randomUUID()}`,
    pipelineStageId: 'stage:lighthouse-preflight', plan, repositoryRoot: fixture, repositoryId: 'repository:lighthouse-preflight',
    grants, maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 1_020_000 });
  assert.equal(result.remote.status.state, 'completed'); assert.equal(result.remote.decision.state, 'passed');
  const imported = records('imports').find((record) => record.stream === 'remote-gate-imports')?.payload;
  assert.equal(imported?.state, 'complete'); assert.equal(imported?.decision.decisionDigest, result.remote.decision.decisionDigest);
  assert.ok(imported.evidenceDigests.length >= 3); assert.equal(imported.remoteResult.cleanupErrors.length, 0);
  const deployment = imported.remoteResult.attempts.flatMap((attempt: any) => attempt.outputs)
    .find((output: any) => output.schemaId === 'kubeclaw.kubernetes-deployment-fixture@1')?.value;
  const performance = imported.remoteResult.attempts.find((attempt: any) => attempt.nodeId === 'performance');
  assert.equal(performance.providerDetails.values.lighthouseVersion, '13.4.1');
  assert.equal(performance.evidence.filter((item: any) => ['performance-report', 'performance-report-representative'].includes(item.type)).length, 3);
  assert.equal(performance.evidence.filter((item: any) => item.type === 'performance-report-representative').length, 1);
  process.stdout.write(`${JSON.stringify({ ok: true, schemaVersion: 'nova-lighthouse-production-preflight.v1', suite: 'perf', runId,
    jobId: result.remote.decision.jobId, provider: route, runtimeRevision, busterRuntimeRevision: imported.remoteResult.workerRevision,
    fixtureRevision: git('rev-parse', 'HEAD'), planDigest: plan.planDigest, resultDigest: result.remote.decision.resultDigest,
    decisionDigest: result.remote.decision.decisionDigest, status: result.remote.status.state, decision: result.remote.decision.state,
    evidenceDigests: imported.evidenceDigests, evidenceImported: true, runnerCleanupVerified: true,
    cleanupVerified: false, clusterCleanupObserved: false, lighthouseVersion: '13.4.1', reportCount: 3,
    immutableImage, imageDigest: image[1],
    resources: { leaseName: deployment.leaseName, namespace: deployment.namespace, serviceName: 'lighthouse-preflight', servicePort: 80 },
    boundary: 'Nova signed source to remote Buster isolated Lighthouse provider plan', mocks: 0, emulators: 0 }, null, 2)}\n`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
