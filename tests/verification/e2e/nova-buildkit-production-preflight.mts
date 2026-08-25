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

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  if (!token) throw new Error('CONTAINER_BUILD_PREFLIGHT_TOKEN_MISSING');
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
    sourceAuthority: 'nova:production',
    pollMilliseconds: 500, maximumResponseBytes: 64 * 1024 * 1024,
    maximumResultBytes: 64 * 1024 * 1024, maximumArchiveBytes: 16 * 1024 * 1024,
    maximumArchiveStoreBytes: 64 * 1024 * 1024, maximumEvidenceBytes: 16 * 1024 * 1024,
    maximumEvidenceStoreBytes: 64 * 1024 * 1024,
    recordLimits: { maximumRecords: 100, maximumBytes: 64 * 1024 * 1024,
      maximumRecordBytes: 16 * 1024 * 1024 }, legacyLedger: {} });
  const result = await nova.execute({ idempotencyKey: `container-build:${crypto.randomUUID()}`,
    pipelineStageId: 'stage:container-build-preflight', plan, repositoryRoot: fixture,
    repositoryId: 'repository:container-build-preflight',
    grants: new Map(plan.nodes.map((node) => [node.id, ['container.build']])),
    maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 1_020_000,
    legacySuites: [] });
  if (result.remote.decision.state !== 'passed' || result.remote.status.state !== 'completed') {
    throw new Error(`CONTAINER_BUILD_PREFLIGHT_FAILED:${JSON.stringify(result.remote)}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, schemaVersion: 'nova-container-build-preflight.v3',
    runId, provider: route, status: result.remote.status.state, decision: result.remote.decision.state,
    sourceRevision: git('rev-parse', 'HEAD') }, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
