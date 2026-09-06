#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const keep = process.argv.includes('--keep-artifacts');
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex < 0 ? 'full' : process.argv[modeIndex + 1];
if (mode !== 'fast' && mode !== 'full') throw new Error('--mode must be fast or full');
const resultIndex = process.argv.indexOf('--result-path');
const resultPath = path.resolve(
  resultIndex < 0
    ? path.join(repositoryRoot, '.swarm', 'real-e2e', 'latest-v2.json')
    : process.argv[resultIndex + 1] ?? '',
);
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
if (!gatewayToken) throw new Error('REAL_E2E_OPENCLAW_GATEWAY_TOKEN_MISSING');
const model = process.env.REAL_E2E_MODEL ?? 'openai/gpt-5.6-sol';
const thinking = process.env.REAL_E2E_THINKING ?? 'high';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-v2-real-e2e-'));
const project = path.join(root, 'project');
const state = path.join(root, 'state');
const artifacts = path.join(root, 'artifacts');
const telemetry = path.join(root, 'telemetry');
const platformPath = path.join(root, 'platform.json');
const pipelinePath = path.join(root, 'pipeline.json');
const runId = `run:real-e2e:${crypto.randomUUID()}`;

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();
}

function grant(capabilities: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return capabilities;
}

try {
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'README.md'), '# KubeClaw v2 real E2E\n');
  fs.writeFileSync(path.join(project, 'smoke.test.mjs'), [
    "import assert from 'node:assert/strict';",
    "import fs from 'node:fs';",
    "assert.match(fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8'), /IMPLEMENTED_BY_V2/);",
    "console.log(JSON.stringify({ok:true,suite:'real-v2'}));",
    '',
  ].join('\n'));
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'KubeClaw E2E');
  git('config', 'user.email', 'e2e@kubeclaw.invalid');
  git('add', '.');
  git('commit', '-m', 'Seed v2 real E2E');
  const headBefore = git('rev-parse', 'HEAD');
  const gatewayEndpoint = 'http://127.0.0.1:18789/tools/invoke';
  const pluginRoots = [
    path.join(repositoryRoot, 'skills', 'common', 'plugins'),
    path.join(repositoryRoot, 'skills', 'nova', 'plugins'),
    path.join(repositoryRoot, 'skills', 'buster', 'plugins'),
  ];
  const runtimeGrant = { allowedAgents: ['architecture', 'implementation', 'testing', 'review'] };
  const artifactGrant = (namespace: string) => ({ allowedNamespaces: [namespace] });
  writeJson(platformPath, {
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: pluginRoots,
    trustedBuiltinRoots: pluginRoots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: {
      'artifacts.read': 'kubeclaw.artifact-store:artifact-store',
      'artifacts.write': 'kubeclaw.artifact-store:artifact-store',
      'command.execute': 'kubeclaw.command-runner:command',
      'network.http': 'kubeclaw.network-http:http',
      'git.repository.read': 'kubeclaw.repository-adapter:repository',
      'runtime.dispatch': 'kubeclaw.runtime-dispatch:openclaw',
      'secrets.read': 'kubeclaw.secret-resolver:secrets',
      'telemetry.emit': 'kubeclaw.telemetry-store:telemetry',
    },
    grants: {
      'kubeclaw.architecture-validator:architecture': grant({
        'runtime.dispatch': runtimeGrant,
        'artifacts.write': artifactGrant('kubeclaw.architecture-validator'),
      }),
      'kubeclaw.implementation-agent:implementation': grant({
      'artifacts.read': { allowedNamespaces: ['kubeclaw.lint', 'kubeclaw.review', 'kubeclaw.buster-quality-gate', 'kubeclaw.test-agent'] },
        'runtime.dispatch': runtimeGrant,
        'artifacts.write': artifactGrant('kubeclaw.implementation-agent'),
      }),
      'kubeclaw.test-agent:test': grant({
        'command.execute': { allowedExecutables: [process.execPath], allowedWorkingRoots: [project] },
        'runtime.dispatch': runtimeGrant,
        'artifacts.write': artifactGrant('kubeclaw.test-agent'),
      }),
      'kubeclaw.review:review': grant({
        'runtime.dispatch': runtimeGrant,
        'git.repository.read': { allowedPrefixes: ['.'] },
        'artifacts.read': artifactGrant('kubeclaw.review'),
        'artifacts.write': artifactGrant('kubeclaw.review'),
      }),
      'kubeclaw.project-summary:summary': grant({
        'artifacts.write': artifactGrant('kubeclaw.project-summary'),
      }),
      'kubeclaw.runtime-dispatch:openclaw': grant({
        'git.repository.read': { allowedPrefixes: ['.swarm/runtime-results/'] },
        'network.http': { allowedOrigins: ['http://127.0.0.1:18789'] },
        'secrets.read': { allowedNames: ['openclaw.gateway'] },
      }),
      'kubeclaw.telemetry-observer:telemetry': grant({
        'telemetry.emit': {
          allowedEventPrefixes: ['run.', 'stage.', 'attempt.', 'effect.', 'artifact.', 'wait.', 'orchestrator.'],
        },
      }),
    },
    adapters: {
      'kubeclaw.artifact-store:artifact-store': { artifactRoot: artifacts },
      'kubeclaw.command-runner:command': {
        allowedExecutables: [process.execPath],
        allowedWorkingRoots: [project],
        maxOutputBytes: 1_048_576,
        maxExecutionMs: 120_000,
        terminationGraceMs: 2_000,
      },
      'kubeclaw.network-http:http': {
        allowedOrigins: ['http://127.0.0.1:18789'],
        allowedMethods: ['POST'],
        allowedHeaders: ['authorization', 'content-type'],
        maxRequestBytes: 2_097_152,
        maxResponseBytes: 2_097_152,
        timeoutMs: 30_000,
      },
      'kubeclaw.repository-adapter:repository': {
        repositoryRoot: project,
        maxFileBytes: 2_097_152,
      },
      'kubeclaw.runtime-dispatch:openclaw': {
        targets: Object.fromEntries(['architecture', 'implementation', 'testing', 'review'].map((id) => [id, {
          endpoint: gatewayEndpoint,
          tokenSecret: 'openclaw.gateway',
          runtime: 'subagent',
          agentId: 'main',
          controllerSessionKey: 'agent:main:nova-review-controller',
          collectorMode: true,
          model,
          thinking,
          cwd: project,
          pollMs: 250,
          maxPolls: mode === 'fast' ? 2_400 : 4_800,
          sessionTimeoutMs: mode === 'fast' ? 600_000 : 1_800_000,
          resultPathPrefix: '.swarm/runtime-results',
        }])),
      },
      'kubeclaw.secret-resolver:secrets': {
        environment: { 'openclaw.gateway': 'OPENCLAW_GATEWAY_TOKEN' },
      },
      'kubeclaw.telemetry-store:telemetry': { root: telemetry },
    },
    activeAdapters: [],
    observers: { 'kubeclaw.telemetry-observer:telemetry': {} },
    storageRoot: state,
    shutdownTimeoutMs: 10_000,
    orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [],
  });
  writeJson(pipelinePath, {
    schemaVersion: 'pipeline-definition.v2',
    id: 'kubeclaw:real-e2e',
    maxConcurrency: 1,
    stages: [
      {
        id: 'architecture',
        type: 'kubeclaw.validate.architecture',
        dependsOn: [],
        config: { agent: 'architecture' },
        input: {
          task: 'Validate the tiny local smoke project. It has a README and a Node smoke test. Return passed with README.md in checkedFiles.',
          architecture: { components: ['README', 'smoke test'], boundaries: ['local filesystem only'] },
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 300_000 },
      },
      {
        id: 'implementation',
        type: 'kubeclaw.agent.implementation',
        dependsOn: ['architecture'],
        config: { agent: 'implementation' },
        input: {
          runId,
          moduleId: 'smoke',
          attempt: 1,
          headBefore,
          task: 'Edit README.md in the current repository and append a line containing exactly IMPLEMENTED_BY_V2. Run node smoke.test.mjs after editing. Return the required completion JSON with changedPaths ["README.md"] and a passed check.',
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 600_000 },
      },
      {
        id: 'test',
        type: 'kubeclaw.test.execution',
        dependsOn: ['implementation'],
        config: { agent: 'testing' },
        input: {
          runId,
          taskId: 'smoke',
          attempt: 1,
          task: 'Judge the real Node smoke-test evidence. PASS when the command suite passed.',
          suiteEvidence: [],
          commandSuites: [{
            suite: 'node-smoke',
            executable: process.execPath,
            args: ['smoke.test.mjs'],
            workingDirectory: project,
          }],
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 300_000 },
      },
      {
        id: 'review',
        type: 'kubeclaw.decision.review',
        dependsOn: ['test'],
        config: { agent: 'review' },
        input: {
          task: 'Review the KubeClaw v2 smoke implementation and return PASS.',
          evidence: {
            openedArtifacts: ['README.md', 'smoke.test.mjs'],
            checkedContracts: ['README contains IMPLEMENTED_BY_V2', 'node smoke test exits zero'],
            failedCommands: [],
            unverifiedRequirements: [],
          },
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 300_000 },
      },
      {
        id: 'summary',
        type: 'kubeclaw.report.project-summary',
        dependsOn: ['review'],
        config: {},
        input: {
          projectId: 'real-v2',
          runId,
          status: 'succeeded',
          metrics: {
            modulesTotal: 1,
            modulesPassed: 1,
            testsPassed: 1,
            testsFailed: 0,
            agentInvocations: 4,
          },
        },
        execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 30_000 },
      },
    ],
  });
  const execution = spawnSync(process.execPath, [
    path.join(repositoryRoot, 'skills', 'nova', 'pipeline.ts'),
    '--platform', platformPath,
    '--pipeline', pipelinePath,
    '--run-id', runId,
  ], {
    cwd: project,
    env: process.env,
    encoding: 'utf8',
    timeout: mode === 'fast' ? 900_000 : 1_800_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = execution.stdout.trim().split('\n').filter(Boolean);
  const result = JSON.parse(stdout.at(-1) ?? '{}');
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.equal(result.status, 'succeeded');
  assert.match(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), /IMPLEMENTED_BY_V2/);
  assert.equal(spawnSync(process.execPath, ['smoke.test.mjs'], { cwd: project }).status, 0);
  for (const id of ['architecture', 'implementation', 'test', 'review', 'summary']) {
    assert.equal(result.stages[id]?.status, 'succeeded', `stage ${id} did not succeed`);
  }
  const journal = fs.readFileSync(
    path.join(state, 'runs', runId.replace(/[^a-zA-Z0-9._-]/g, '_'), 'events.jsonl'),
    'utf8',
  );
  assert.match(journal, /"type":"run.succeeded"/);
  assert.ok(fs.existsSync(telemetry));
  const record = {
    schemaVersion: 'real-pipeline-e2e-result.v2',
    ok: true,
    mode,
    runId,
    model,
    stages: Object.fromEntries(Object.entries(result.stages).map(([id, value]) => [
      id,
      (value as { status?: string }).status,
    ])),
    assertions: {
      realAgentMutation: true,
      realCommandSuite: true,
      lifecycleCommittedByCore: true,
      telemetryDelivered: true,
    },
    artifactRoot: keep ? root : null,
  };
  writeJson(resultPath, record);
  process.stdout.write(`${JSON.stringify(record)}\n`);
} catch (error) {
  const failure = {
    schemaVersion: 'real-pipeline-e2e-result.v2',
    ok: false,
    mode,
    runId,
    error: error instanceof Error ? error.message : String(error),
    artifactRoot: root,
  };
  writeJson(resultPath, failure);
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
} finally {
  if (!keep && process.exitCode !== 1) fs.rmSync(root, { recursive: true, force: true });
}
