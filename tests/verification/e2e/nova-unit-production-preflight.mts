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
  type TestScopeDeclaration,
} from '@kubeclaw/nova-core';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-unit-preflight-'));
const fixture = path.join(temporary, 'fixture');
const state = path.join(temporary, 'nova-state');
const runId = `run:unit-preflight:${crypto.randomUUID()}`;
const token = process.env.BUSTER_V2_TOKEN;
const privateKey = process.env.BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

try {
  if (!token) throw new Error('UNIT_PREFLIGHT_TOKEN_MISSING');
  if (!privateKey) throw new Error('UNIT_PREFLIGHT_SOURCE_KEY_MISSING');
  const route = resolveProviderCapability(parseCapabilityProviders(), 'buster', 'test.plan.execute');
  if (route.adapter !== 'buster-plan-v1') throw new Error(`UNIT_PREFLIGHT_PROVIDER_UNSUPPORTED:${route.adapter}`);

  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'scripts', 'unit.mjs'), [
    "import fs from 'node:fs';",
    "fs.mkdirSync('reports', { recursive: true });",
    "fs.writeFileSync('reports/unit.xml', '<testsuite name=\"production\"><testcase name=\"real-process\"/></testsuite>');",
    '',
  ].join('\n'));
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'KubeClaw Nova Preflight');
  git('config', 'user.email', 'nova-preflight@kubeclaw.invalid');
  git('add', '.');
  git('commit', '-qm', 'Create unit preflight fixture');

  const pluginRoot = path.join(repositoryRoot, 'skills/buster/plugins');
  const registry = buildRegistry(discoverPackages({ installationRoots: [pluginRoot], trustPolicy: {
    trustedBuiltinRoots: [pluginRoot], allowedSourceDigests: new Map(), verifiedAttestations: new Map(),
    verifierId: 'unit-production-preflight',
  } }));
  const declaration: TestScopeDeclaration = { suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: { production: {
    uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0, concurrencyGroup: 'unit',
    config: { executable: 'node', args: ['scripts/unit.mjs'], workingDirectory: '.', resultMode: 'junit-required',
      reports: [{ id: 'unit', format: 'junit', path: 'reports/unit.xml', mediaType: 'application/junit+xml' }] },
  } } } }, concurrencyLimits: { unit: 1 } };
  const template = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'contracts/pipeline-test-gate/v1/suites/unit.v1.json'), 'utf8'));
  const limits = { cpuMillis: 30_000, memoryBytes: 512 * 1024 * 1024,
    logBytes: 1024 * 1024, artifactBytes: 8 * 1024 * 1024, artifactFiles: 16, processes: 16 };
  const plan = resolveTestPlan({ planId: 'plan:unit:production-preflight', runId,
    project: 'unit-production-preflight', scope: { moduleId: 'application', gateId: null },
    createdAt: new Date().toISOString(), declaration, suiteTemplates: [template], registry,
    facts: { changedPaths: ['scripts/unit.mjs'], moduleType: 'service', pipelineStage: 'preflight' },
    policy: { defaultTimeoutMs: 30_000, maximumTimeoutMs: 30_000,
      defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 0, maximumMatrixSize: 1,
      maximumNodes: 2, defaultConcurrencyLimit: 1, maximumConcurrencyLimits: { unit: 1 } } });
  const nova = createProductionNovaTestGate({ stateRoot: state, endpoint: route.endpoint, token,
    sourceAuthority: 'nova:production', sourceAttestationPrivateKey: privateKey,
    pollMilliseconds: 500, maximumResponseBytes: 16 * 1024 * 1024,
    maximumResultBytes: 16 * 1024 * 1024, maximumArchiveBytes: 8 * 1024 * 1024,
    maximumArchiveStoreBytes: 32 * 1024 * 1024, maximumEvidenceBytes: 8 * 1024 * 1024,
    maximumEvidenceStoreBytes: 32 * 1024 * 1024,
    recordLimits: { maximumRecords: 100, maximumBytes: 32 * 1024 * 1024,
      maximumRecordBytes: 8 * 1024 * 1024 }, legacyLedger: {} });
  const result = await nova.execute({ idempotencyKey: `unit:${crypto.randomUUID()}`,
    pipelineStageId: 'stage:unit-preflight', plan, repositoryRoot: fixture,
    repositoryId: 'repository:unit-preflight', grants: new Map(plan.nodes.map((node) => [node.id, ['command.execute']])),
    maximumConcurrency: 1, submittedAt: new Date().toISOString(), timeoutMs: 120_000, legacySuites: [] });
  if (result.remote.decision.state !== 'passed' || result.remote.status.state !== 'completed') {
    throw new Error(`UNIT_PREFLIGHT_FAILED:${JSON.stringify(result.remote)}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, schemaVersion: 'nova-unit-preflight.v1', runId,
    provider: route, status: result.remote.status.state, decision: result.remote.decision.state,
    sourceRevision: git('rev-parse', 'HEAD') }, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
