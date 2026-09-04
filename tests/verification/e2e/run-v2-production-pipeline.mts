#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRegistry,
  discoverPackages,
  loadPipelineDefinition,
  loadPipelineLintDeclaration,
  loadPipelineTestScope,
  recoverPipelineV2,
  resolveTestPlan,
  resumePipelineV2,
  runPipelineV2,
  validatePipelineRuntimeV2,
} from '../../../skills/nova/core/src/index.ts';
import { loadPlatformConfig } from '../../../skills/common/plugin-runtime/foundation/config/platform.ts';
import type { ResumeSignal } from '../../../skills/common/plugin-runtime/sdk/src/index.ts';
import { parseProductionPipelineArgs } from './production-pipeline-args.mts';
import { parseCapabilityProviders, resolveProviderCapability } from './provider-catalog.mjs';
import { writeRunLintPolicy } from './manifest-lint-production.mts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const SPARK_MODEL = 'openai/gpt-5.3-codex-spark';

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;
}

function safe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80);
}

function chartAgentRole(fallback: string): string {
  const candidate = (process.env.AGENT_ROLE ?? process.env.AGENT_NAME ?? fallback).trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(candidate)) {
    throw new Error(`REAL_E2E_AGENT_ROLE_INVALID:${candidate}`);
  }
  return candidate;
}

function git(cwd: string, ...gitArgs: string[]): string {
  return execFileSync('git', gitArgs, { cwd, encoding: 'utf8' }).trim();
}

function moduleTask(
  moduleId: string,
  module: Record<string, any>,
  projectRelative: string,
  runId: string,
): string {
  const owned = Array.isArray(module.owned_paths) ? module.owned_paths : [];
  const mutation = moduleId === '01-nginx'
    ? 'Add a comment containing the run ID to nginx/default.conf without changing its serving behavior.'
    : moduleId === '02-nginx'
      ? 'Add a data-run marker containing the run ID to src/content/branch-a.html.'
      : moduleId === '03-nginx'
        ? 'Add a CSS comment containing the run ID to src/assets/branch-b.css.'
        : 'Replace REAL_E2E_RUN_ID_PLACEHOLDER in src/index.html with the supplied run ID.';
  return [
    `You are Forge for module ${moduleId} (${String(module.role ?? 'module')}).`,
    `Work only inside ${projectRelative}.`,
    `Within that project, your owned paths are exactly: ${owned.join(', ')}.`,
    `In changedPaths, return every changed file relative to the Git repository root; prefix these project paths with ${projectRelative}/.`,
    mutation,
    `Use run ID ${runId}.`,
    `Run: npm run verify:${moduleId} from ${projectRelative}.`,
    'Do not commit; the v2 Git capability owns commit, merge, and cleanup.',
    'Return ready_for_testing only after a real edit and the real verification command passes.',
  ].join('\n');
}

function moduleCommandSuites(
  moduleId: string,
  module: Record<string, any>,
  repo: string,
): readonly Readonly<Record<string, unknown>>[] {
  const declarations = module.real_e2e_command_suites;
  if (declarations === undefined) return [];
  if (!Array.isArray(declarations)) throw new Error(`REAL_E2E_COMMAND_SUITES_INVALID:${moduleId}`);
  return declarations.map((declaration, index) => {
    if (
      !declaration
      || typeof declaration !== 'object'
      || Array.isArray(declaration)
      || declaration.kind !== 'fail-once'
      || declaration.suite !== 'retry-fixture'
      || Object.keys(declaration).some((key) => !['kind', 'suite'].includes(key))
    ) {
      throw new Error(`REAL_E2E_COMMAND_SUITE_INVALID:${moduleId}:${index}`);
    }
    const marker = path.join(repo, '.swarm', 'logs', `real-e2e-retry-fixture-${safe(moduleId)}.txt`);
    const code = [
      'const fs=require("node:fs")',
      'const marker=process.argv[1]',
      'fs.mkdirSync(require("node:path").dirname(marker),{recursive:true})',
      'if(!fs.existsSync(marker)){fs.writeFileSync(marker,"failed-once\\n");console.error("REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE");process.exit(1)}',
      'console.log("REAL_E2E_RETRY_RECOVERED")',
    ].join(';');
    return Object.freeze({
      suite: 'retry-fixture',
      executable: process.execPath,
      args: ['-e', code, marker],
      workingDirectory: repo,
    });
  });
}

function grant(constraints: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return constraints;
}

function runtimeTarget(
  endpoint: string,
  cwd: string,
  repositoryRoot: string,
  model: string,
  thinking: string,
  agentRole: string,
  resultPathPrefix: string,
  tokenSecret = 'openclaw.gateway',
  resultEndpoint?: string,
  resultTokenSecret?: string,
): Readonly<Record<string, unknown>> {
  const openClawThinking = thinking === 'none' ? 'off' : thinking;
  return {
    endpoint,
    tokenSecret,
    runtime: 'subagent',
    agentId: 'main',
    controllerSessionKey: 'agent:main:nova-review-controller',
    collectorMode: true,
    agentRole,
    model,
    thinking: openClawThinking,
    cwd,
    repositoryRoot,
    pollMs: 2_000,
    maxPollMs: 15_000,
    maxPolls: 1_200,
    sessionTimeoutMs: 1_800_000,
    resultPathPrefix,
    ...(resultEndpoint ? { resultEndpoint, resultTokenSecret } : {}),
  };
}

async function waitForOperator(
  file: string,
  waitId: string,
  signalType: string,
): Promise<ResumeSignal> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const state = readJson(file);
      const status = String(state.status ?? '').toUpperCase();
      if (status === 'APPROVED' || status === 'REJECTED') {
        const issuedAt = typeof state.resolved_at === 'string'
          ? state.resolved_at
          : new Date().toISOString();
        return {
          schemaVersion: 'resume-signal.v2',
          signalId: `signal:${crypto.randomUUID()}`,
          idempotencyKey: `signal:${waitId}:${status.toLowerCase()}`,
          waitId,
          signalType,
          issuer: { type: 'operator', id: 'real-e2e-operator' },
          issuedAt,
          payload: {
            decision: status === 'APPROVED' ? 'approved' : 'rejected',
            issuer: { type: 'operator', id: 'real-e2e-operator' },
            reason: String(state.reason ?? 'Resolved by real E2E operator.'),
          },
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('REAL_E2E_OPERATOR_TIMEOUT');
}

async function main(): Promise<void> {
  const parsed = parseProductionPipelineArgs(process.argv.slice(2));
  const projectName = parsed.project;
  const repo = path.resolve(parsed.repo ?? '');
  const model = parsed.model ?? SPARK_MODEL;
  const thinking = parsed.thinking ?? 'none';
  if (!projectName || !fs.existsSync(repo)) throw new Error('PROJECT_OR_REPOSITORY_INVALID');
  if (model !== SPARK_MODEL) throw new Error(`REAL_E2E_MODEL_MUST_BE_SPARK:${model}`);
  const project = path.join(repo, 'Projects', projectName, 'src');
  const swarm = path.join(project, '.swarm');
  const progress = readJson(path.join(swarm, 'progress.json'));
  const lintDeclaration = loadPipelineLintDeclaration(path.join(swarm, 'pipeline.json'));
  if (!lintDeclaration) throw new Error('REAL_E2E_MANIFEST_LINT_DECLARATION_MISSING');
  const runId = String(progress.run_id ?? process.env.REAL_E2E_RUN_ID ?? `real-e2e:${crypto.randomUUID()}`);
  const modules = progress.modules as Record<string, Record<string, any>>;
  const moduleIds = Object.keys(modules);
  if (moduleIds.length !== 4) throw new Error(`REAL_E2E_MODULE_TOPOLOGY_INVALID:${moduleIds.length}`);
  const stateRoot = path.join(swarm, 'v2-runtime');
  const artifacts = path.join(swarm, 'artifacts', 'v2');
  const workspaces = path.join(stateRoot, 'forge-worktrees');
  const runtimeResults = path.join(repo, '.swarm', 'runtime-results');
  fs.mkdirSync(workspaces, { recursive: true });
  fs.mkdirSync(runtimeResults, { recursive: true });
  const lintPolicyPath = writeRunLintPolicy(repositoryRoot, stateRoot, lintDeclaration);
  const headBefore = git(repo, 'rev-parse', 'HEAD');
  const gitExecutable = fs.realpathSync(execFileSync('sh', ['-lc', 'command -v git'], { encoding: 'utf8' }).trim());
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!gatewayToken) throw new Error('REAL_E2E_OPENCLAW_GATEWAY_TOKEN_MISSING');
  const gatewayOrigin = 'http://127.0.0.1:18789';
  const gatewayEndpoint = `${gatewayOrigin}/tools/invoke`;
  const remoteProviders = parseCapabilityProviders();
  if (!process.env.BUSTER_V2_TOKEN) {
    throw new Error('REAL_E2E_BUSTER_V2_CONFIG_MISSING');
  }
  const busterPlanRoute = resolveProviderCapability(remoteProviders, 'buster', 'test.plan.execute');
  if (busterPlanRoute.adapter !== 'buster-plan-v1') {
    throw new Error(`REAL_E2E_TEST_PLAN_ADAPTER_UNSUPPORTED:${busterPlanRoute.adapter}`);
  }
  if (!process.env.BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY) {
    throw new Error('REAL_E2E_BUSTER_SOURCE_KEY_MISSING');
  }
  const busterRuntimeRoute = resolveProviderCapability(
    remoteProviders,
    'buster',
    'runtime.dispatch',
  );
  if (busterRuntimeRoute.adapter !== 'openclaw') {
    throw new Error(`REAL_E2E_RUNTIME_ADAPTER_UNSUPPORTED:${busterRuntimeRoute.adapter}`);
  }
  const busterGatewayOrigin = busterRuntimeRoute.endpoint;
  const busterGatewayEndpoint = `${busterGatewayOrigin}/tools/invoke`;
  const busterRepositoryRoot = process.env.BUSTER_GATEWAY_REPOSITORY_ROOT ?? '';
  if (!busterRepositoryRoot) throw new Error('REAL_E2E_BUSTER_GATEWAY_REPOSITORY_ROOT_MISSING');
  if (!process.env.BUSTER_GATEWAY_TOKEN) throw new Error('REAL_E2E_BUSTER_GATEWAY_TOKEN_MISSING');
  const webhook = process.env.DISCORD_WEBHOOK ?? '';
  if (!webhook) throw new Error('REAL_E2E_DISCORD_WEBHOOK_MISSING');
  const webhookOrigin = new URL(webhook).origin;
  const projectRelative = path.relative(repo, project).split(path.sep).join('/');
  const roles = Object.freeze({
    nova: chartAgentRole('nova'),
    forge: 'forge',
    buster: 'buster',
    echo: 'echo',
  });
  const targetIds = [
    'architect',
    ...moduleIds.flatMap((moduleId) => [`forge.${moduleId}`, `buster.${moduleId}`]),
    'echo.module-review',
    'buster.final',
    'echo.final-review',
  ];
  const runtimeGrants = { allowedAgents: targetIds };
  const artifact = (namespace: string) => ({ allowedNamespaces: [namespace] });
  const gitWorkspaceGrant = {
    allowedRoots: [repo, workspaces],
    allowedWorkspaceRoots: [workspaces],
  };
  const gitMutationGrant = { allowedRoots: [repo, workspaces] };
  const stageLabels = Object.fromEntries([
    ['architecture', 'Architecture validation'],
    ...moduleIds.flatMap((moduleId) => [
      [`forge-${moduleId}`, `${moduleId} implementation`],
      [`buster-${moduleId}`, `${moduleId} verification`],
    ]),
    ['module-review', 'Module review'],
    ['manifest-lint', 'Kubernetes manifest lint'],
    ['operator-approval', 'Operator approval'],
    ['final-buster', 'Final deployment verification'],
    ['final-review', 'Final review'],
    ['summary', 'Project summary'],
  ]);
  const providers = {
    'artifacts.read': 'kubeclaw.artifact-store:artifact-store',
    'artifacts.write': 'kubeclaw.artifact-store:artifact-store',
    'test.plan.execute': 'kubeclaw.remote-test-gate:plan',
    'lint.execute': 'kubeclaw.lint:executor',
    'command.execute': 'kubeclaw.command-runner:command',
    'git.workspace.create': 'kubeclaw.git-workspace:git',
    'git.workspace.remove': 'kubeclaw.git-workspace:git',
    'git.commit': 'kubeclaw.git-workspace:git',
    'git.merge': 'kubeclaw.git-workspace:git',
    'git.repository.read': 'kubeclaw.repository-adapter:repository',
    'network.http': 'kubeclaw.network-http:http',
    'operator.request': 'kubeclaw.operator-messaging:operator',
    'runtime.dispatch': 'kubeclaw.runtime-dispatch:openclaw',
    'secrets.read': 'kubeclaw.secret-resolver:secrets',
    'signal.wait': 'kubeclaw.wait-store:waits',
    'telemetry.emit': 'kubeclaw.telemetry-store:telemetry',
  };
  const grants: Record<string, Record<string, unknown>> = {
    'kubeclaw.architecture-validator:architecture': {
      'runtime.dispatch': runtimeGrants,
      'artifacts.write': artifact('kubeclaw.architecture-validator'),
    },
    'kubeclaw.implementation-agent:implementation': {
      'runtime.dispatch': runtimeGrants,
      'git.workspace.create': gitWorkspaceGrant,
      'git.workspace.remove': gitWorkspaceGrant,
      'git.commit': gitMutationGrant,
      'git.merge': gitMutationGrant,
      'artifacts.write': artifact('kubeclaw.implementation-agent'),
    },
    'kubeclaw.test-agent:test': {
      'command.execute': { allowedExecutables: [process.execPath], allowedWorkingRoots: [repo] },
      'test.plan.execute': { allowedRoots: [repo] },
      'runtime.dispatch': runtimeGrants,
      'artifacts.write': artifact('kubeclaw.test-agent'),
    },
    'kubeclaw.review:review': {
      'runtime.dispatch': runtimeGrants,
      'git.repository.read': { allowedPrefixes: ['.'] },
      'artifacts.read': artifact('kubeclaw.review'),
      'artifacts.write': artifact('kubeclaw.review'),
    },
    'kubeclaw.lint:full': {
      'lint.execute': {
        allowedRoots: [repo],
        allowedPolicyRoots: [path.dirname(lintPolicyPath)],
        allowedProjects: [lintDeclaration.policyProject],
      },
      'artifacts.write': artifact('kubeclaw.lint'),
    },
    'kubeclaw.human-approval:approval': {
      'operator.request': { allowedTargets: ['discord'] },
      'signal.wait': {
        allowedSignalTypes: ['approval.resolved'],
        allowedIssuerIds: ['real-e2e-operator'],
      },
    },
    'kubeclaw.human-approval:architecture-approval': {
      'artifacts.read': { allowedNamespaces: ['kubeclaw.architecture-validator'] },
      'operator.request': { allowedTargets: ['discord'] },
      'signal.wait': {
        allowedSignalTypes: ['approval.resolved'],
        allowedIssuerIds: ['real-e2e-operator'],
      },
    },
    'kubeclaw.buster-quality-gate:quality': {
      'test.plan.execute': { allowedRoots: [repo] },
      'runtime.dispatch': runtimeGrants,
      'artifacts.write': artifact('kubeclaw.buster-quality-gate'),
    },
    'kubeclaw.project-summary:summary': {
      'artifacts.write': artifact('kubeclaw.project-summary'),
    },
    'kubeclaw.runtime-dispatch:openclaw': {
      'git.repository.read': { allowedPrefixes: ['.swarm/runtime-results/'] },
      'network.http': { allowedOrigins: [gatewayOrigin, new URL(busterGatewayOrigin).origin] },
      'secrets.read': { allowedNames: ['openclaw.gateway', 'buster.gateway', 'buster.worker'] },
    },
    'kubeclaw.remote-test-gate:plan': {
      'secrets.read': { allowedNames: ['buster.worker', 'buster.source-private-key'] },
    },
    'kubeclaw.operator-messaging:operator': {
      'network.http': { allowedOrigins: [webhookOrigin] },
      'secrets.read': { allowedNames: ['discord.webhook'] },
    },
    'kubeclaw.notification-observer:notifications': {
      'operator.request': { allowedTargets: ['discord'] },
    },
    'kubeclaw.telemetry-observer:telemetry': {
      'telemetry.emit': {
        allowedEventPrefixes: [
          'run.', 'stage.', 'attempt.', 'effect.', 'artifact.', 'wait.', 'orchestrator.',
        ],
      },
    },
  };
  const targets: Record<string, unknown> = {
    architect: runtimeTarget(gatewayEndpoint, repo, repo, model, thinking, roles.nova, '.swarm/runtime-results'),
    'echo.module-review': runtimeTarget(gatewayEndpoint, repo, repo, model, thinking, roles.echo, '.swarm/runtime-results'),
    'buster.final': runtimeTarget(
      busterGatewayEndpoint, busterRepositoryRoot, busterRepositoryRoot, model, thinking, roles.buster,
      '.swarm/runtime-results', 'buster.gateway',
      undefined, undefined,
    ),
    'echo.final-review': runtimeTarget(gatewayEndpoint, repo, repo, model, thinking, roles.echo, '.swarm/runtime-results'),
  };
  for (const moduleId of moduleIds) {
    const workspacePath = path.join(workspaces, moduleId);
    const workspaceResultPrefix = path.relative(
      repo,
      path.join(workspacePath, '.swarm', 'runtime-results'),
    ).split(path.sep).join('/');
    targets[`forge.${moduleId}`] = runtimeTarget(
      gatewayEndpoint,
      workspacePath,
      repo,
      model,
      thinking,
      roles.forge,
      workspaceResultPrefix,
    );
    targets[`buster.${moduleId}`] = runtimeTarget(
      busterGatewayEndpoint,
      busterRepositoryRoot,
      busterRepositoryRoot,
      model,
      thinking,
      roles.buster,
      '.swarm/runtime-results',
      'buster.gateway',
      undefined,
      undefined,
    );
  }
  const pluginRoots = [
    path.join(repositoryRoot, 'skills/common/plugins'),
    path.join(repositoryRoot, 'skills/nova/plugins'),
    path.join(repositoryRoot, 'skills/buster/plugins'),
  ];
  const providerRegistry = buildRegistry(discoverPackages({
    installationRoots: [path.join(repositoryRoot, 'skills/buster/plugins')],
    trustPolicy: { trustedBuiltinRoots: [path.join(repositoryRoot, 'skills/buster/plugins')],
      allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'real-production-e2e' },
  }));
  const suiteTemplates = fs.readdirSync(path.join(repositoryRoot, 'contracts/pipeline-test-gate/v1/suites'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => readJson(path.join(repositoryRoot, 'contracts/pipeline-test-gate/v1/suites', file)) as any);
  const providerPlanFor = (scope: { moduleId: string | null; gateId: string | null }, stageId: string) => {
    const loaded = loadPipelineTestScope(path.join(swarm, 'pipeline.json'), scope);
    const concurrency = Object.fromEntries(Object.entries(loaded.declaration.concurrencyLimits ?? {})
      .map(([group, value]) => [group, Math.max(1, Number(value))]));
    const limits = { cpuMillis: 1_800_000, memoryBytes: 8 * 1024 * 1024 * 1024,
      logBytes: 16 * 1024 * 1024, artifactBytes: 64 * 1024 * 1024,
      artifactFiles: 256, processes: 128 };
    const createdAt = new Date().toISOString();
    const plan = resolveTestPlan({ planId: `plan:${safe(runId)}:${safe(stageId)}`, runId,
      project: loaded.project, scope, createdAt, declaration: loaded.declaration,
      suiteTemplates, registry: providerRegistry,
      facts: { changedPaths: [], moduleType: 'service', pipelineStage: stageId },
      policy: { defaultTimeoutMs: 900_000, maximumTimeoutMs: 1_800_000,
        defaultLimits: limits, maximumLimits: limits, maximumRetryCount: 2,
        maximumMatrixSize: 16, maximumNodes: 128, defaultConcurrencyLimit: 1,
        maximumConcurrencyLimits: concurrency } });
    if (!plan.nodes.some((node) => node.provider.contractId === 'kubeclaw.dependency-scan-trivy@1')) {
      throw new Error(`REAL_E2E_MANDATORY_DEPENDENCY_SECURITY_MISSING:${stageId}`);
    }
    const grants = Object.fromEntries(plan.nodes.map((node) => {
      const provider = providerRegistry.testProviderContracts.get(node.provider.contractId);
      if (!provider) throw new Error(`REAL_E2E_PROVIDER_MISSING:${node.provider.contractId}`);
      return [node.id, [...provider.declaration.requiredCapabilities].sort()];
    }));
    return { repositoryRoot: repo, repositoryId: `repository:${projectName}`, plan, grants,
      maximumConcurrency: 4, submittedAt: createdAt, timeoutMs: 2_100_000 };
  };
  const platformPath = path.join(stateRoot, 'platform.json');
  const pipelinePath = path.join(stateRoot, 'pipeline.json');
  writeJson(platformPath, {
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: pluginRoots,
    trustedBuiltinRoots: pluginRoots,
    externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers,
    grants,
    adapters: {
      'kubeclaw.artifact-store:artifact-store': { artifactRoot: artifacts },
      'kubeclaw.lint:executor': {
        allowedRepositoryRoots: [repo],
        allowedPolicyRoots: [path.dirname(lintPolicyPath)],
      },
      'kubeclaw.remote-test-gate:plan': {
        endpoint: busterPlanRoute.endpoint,
        authentication: 'bearer',
        tokenSecret: 'buster.worker',
        sourcePrivateKeySecret: 'buster.source-private-key',
        sourceAuthority: 'nova:production',
        stateRoot: path.join(stateRoot, 'provider-gates'),
        allowedRepositoryRoots: [repo],
      },
      'kubeclaw.command-runner:command': {
        allowedExecutables: [process.execPath],
        allowedWorkingRoots: [repo],
        maxOutputBytes: 16_777_216,
        maxExecutionMs: 1_800_000,
        terminationGraceMs: 2_000,
      },
      'kubeclaw.git-workspace:git': {
        allowedRepositoryRoots: [repo],
        workspaceRoot: workspaces,
        gitExecutable,
        authorName: 'KubeClaw Forge',
        authorEmail: 'forge@kubeclaw.invalid',
        maxExecutionMs: 300_000,
        maxOutputBytes: 16_777_216,
        terminationGraceMs: 2_000,
      },
      'kubeclaw.repository-adapter:repository': {
        repositoryRoot: repo,
        maxFileBytes: 2_097_152,
      },
      'kubeclaw.network-http:http': {
        allowedOrigins: [
          gatewayOrigin,
          new URL(busterGatewayOrigin).origin,
          webhookOrigin,
        ],
        allowedMethods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: [
          'authorization',
          'content-type',
          'idempotency-key',
          'x-kubeclaw-signature',
        ],
        maxRequestBytes: 91_226_112,
        maxResponseBytes: 16_777_216,
        timeoutMs: 60_000,
      },
      'kubeclaw.operator-messaging:operator': {
        deliveryRoot: path.join(stateRoot, 'operator-deliveries'),
        targets: {
          discord: {
            endpointOrigin: webhookOrigin,
            endpointSecret: 'discord.webhook',
            maxPayloadBytes: 65_536,
            format: 'discord_webhook',
          },
        },
      },
      'kubeclaw.runtime-dispatch:openclaw': { targets },
      'kubeclaw.secret-resolver:secrets': {
        environment: {
          'openclaw.gateway': 'OPENCLAW_GATEWAY_TOKEN',
          'buster.gateway': 'BUSTER_GATEWAY_TOKEN',
          'buster.worker': 'BUSTER_V2_TOKEN',
          'buster.source-private-key': 'BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY',
          'discord.webhook': 'DISCORD_WEBHOOK',
        },
      },
      'kubeclaw.telemetry-store:telemetry': {
        root: path.join(stateRoot, 'telemetry'),
      },
      'kubeclaw.wait-store:waits': {
        root: path.join(stateRoot, 'waits'),
      },
    },
    activeAdapters: [],
    observers: {
      'kubeclaw.notification-observer:notifications': {
        target: 'discord',
        maxMessageChars: 8_192,
        pipelineLabel: `KubeClaw · ${projectName}`,
        modelLabel: model,
        stageLabels,
        suppressEventTypes: [],
      },
      'kubeclaw.telemetry-observer:telemetry': {},
    },
    storageRoot: stateRoot,
    shutdownTimeoutMs: 30_000,
    orchestratorIssuerId: roles.nova,
    administrativeDecisionIssuers: [],
  });
  const stages: Array<Record<string, unknown>> = [
    {
      id: 'architecture',
      type: 'kubeclaw.validate.architecture',
      dependsOn: [],
      config: { agent: 'architect', agentRole: roles.nova },
      input: {
        task: 'Validate the four-module real nginx E2E architecture, ownership boundaries, parallel branches, release assembly, Buster verification, operator approval, and final deployment verification. Inspect the repository and return concrete checkedFiles.',
        architecture: {
          modules: moduleIds,
          intent: progress.architecture_intent,
          contracts: progress.contracts,
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 900_000 },
    },
    {
      id: 'architecture-approval',
      type: 'kubeclaw.decision.architecture-approval',
      dependsOn: ['architecture'],
      activation: {
        sourceStage: 'architecture',
        fact: 'architecture.review',
        equals: 'approval_required',
      },
      config: {
        target: 'discord',
        issuerId: 'real-e2e-operator',
        timeoutMinutes: 10,
      },
      input: {
        summary: 'Review the architecture findings before Forge begins.',
        artifactId: 'architecture-validation',
        namespace: 'kubeclaw.architecture-validator',
      },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 60_000 },
    },
  ];
  for (const moduleId of moduleIds) {
    const module = modules[moduleId]!;
    const dependencyTests = (module.depends_on as string[]).map((id) => `buster-${id}`);
    const workspacePath = path.join(workspaces, moduleId);
    stages.push({
      id: `forge-${moduleId}`,
      type: 'kubeclaw.agent.implementation',
      dependsOn: ['architecture-approval', ...dependencyTests],
      config: { agent: `forge.${moduleId}`, agentRole: roles.forge },
      input: {
        runId,
        moduleId,
        attempt: 1,
        headBefore,
        task: moduleTask(moduleId, module, projectRelative, runId),
        workspace: {
          repositoryRoot: repo,
          workspacePath,
          branch: `e2e-${safe(runId)}-${moduleId}`.slice(0, 240),
          baseRef: 'HEAD',
          mergeTarget: repo,
          commitMessage: `[forge:${moduleId}] ${module.title}`,
        },
      },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 1_200_000 },
    });
    stages.push({
      id: `buster-${moduleId}`,
      type: 'kubeclaw.test.execution',
      dependsOn: [`forge-${moduleId}`],
      on: { request_fix: `forge-${moduleId}` },
      config: { agent: `buster.${moduleId}`, agentRole: roles.buster },
      input: {
        runId,
        taskId: moduleId,
        attempt: 1,
        task: `Act as Buster for ${moduleId}. Judge the actual production suite results and reject any skipped, failed, or errored required check.`,
        suiteEvidence: [],
        providerPlan: providerPlanFor({ moduleId, gateId: null }, `buster-${moduleId}`),
        // This command is a pipeline-retry fault fixture. It is not a unit suite
        // and cannot become unit gate authority.
        commandSuites: moduleCommandSuites(moduleId, module, repo),
        suitePlan: {
          repositoryRoot: repo,
          suites: module.test_suites,
          testConfig: { ...module.test_config, suite_timeout_ms: 900_000 },
          task: {
            project: projectName,
            run_id: runId,
            module_id: moduleId,
            task_type: 'module',
            contracts: module.contracts,
          },
          moduleId,
        },
      },
      execution: { maxAttempts: 2, maxRemediationCycles: 1, timeoutMs: 1_800_000 },
    });
  }
  const busterStages = moduleIds.map((moduleId) => `buster-${moduleId}`);
  stages.push(
    {
      id: 'module-review',
      type: 'kubeclaw.decision.review',
      dependsOn: busterStages,
      config: { agent: 'echo.module-review' },
      input: {
        task: 'Act as Echo. Review the actual merged four-module repository after Forge and Buster. Inspect Git history, owned paths, module contracts, and run every module verification command. Return PASS only when the module graph and evidence are real.',
        evidence: {
          openedArtifacts: moduleIds.flatMap((id) => modules[id]!.owned_paths),
          checkedContracts: Object.keys(progress.contracts ?? {}),
          failedCommands: [],
          unverifiedRequirements: [],
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1_200_000 },
    },
    {
      id: 'manifest-lint',
      type: 'kubeclaw.lint.full',
      dependsOn: ['module-review'],
      config: { policyPath: lintPolicyPath, policyProject: lintDeclaration.policyProject },
      input: {
        workingDirectory: repo,
        project: projectName,
        kubernetes: {
          rawManifests: lintDeclaration.rawManifests,
          helmCharts: lintDeclaration.helmCharts,
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 300_000 },
    },
    {
      id: 'operator-approval',
      type: 'kubeclaw.decision.human-approval',
      dependsOn: ['manifest-lint'],
      config: {
        target: 'discord',
        issuerId: 'real-e2e-operator',
        timeoutMinutes: 10,
      },
      input: {
        summary: 'Approve the verified four-module release candidate for final deployment and security validation.',
      },
      execution: { maxAttempts: 2, maxRemediationCycles: 0, timeoutMs: 60_000 },
    },
    {
      id: 'final-buster',
      type: 'kubeclaw.test.quality-evaluation',
      dependsOn: ['operator-approval'],
      config: { agent: 'buster.final', agentRole: roles.buster },
      input: {
        runId,
        gateId: 'final-buster',
        attempt: 1,
        task: 'Act as final Buster. Judge the actual provider results, Kubernetes readiness, namespace lease, HTTP checks, and security evidence. Pass only when every required proof is real.',
        suiteEvidence: [],
        providerPlan: providerPlanFor({ moduleId: null, gateId: 'final-buster' }, 'final-buster'),
        suitePlan: {
          repositoryRoot: repo,
          suites: progress.gates['final-buster'].test_suites,
          testConfig: {
            ...progress.gates['final-buster'].test_config,
            suite_timeout_ms: 1_500_000,
          },
          task: {
            project: projectName,
            run_id: runId,
            gate_id: 'final-buster',
            gate_type: 'final',
            contracts: progress.gates['final-buster'].contract,
          },
          moduleId: moduleIds.at(-1),
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 2_100_000 },
    },
    {
      id: 'final-review',
      type: 'kubeclaw.decision.review',
      dependsOn: ['final-buster'],
      config: { agent: 'echo.final-review' },
      input: {
        task: 'Act as final Echo reviewer. Inspect the merged repository, Git history, Buster result artifacts, Kubernetes evidence, security evidence, and lifecycle journal. Return PASS only when the requested production workflow actually ran.',
        evidence: {
          openedArtifacts: [
            'Projects', '.swarm/artifacts/v2', '.swarm/v2-runtime/telemetry',
          ],
          checkedContracts: [
            'deployable artifact', 'runtime config', 'preview infrastructure',
          ],
          failedCommands: [],
          unverifiedRequirements: [],
        },
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1_200_000 },
    },
    {
      id: 'summary',
      type: 'kubeclaw.report.project-summary',
      dependsOn: ['final-review'],
      config: { agentRole: roles.nova },
      input: {
        projectId: projectName,
        runId,
        status: 'succeeded',
        metrics: {
          modulesTotal: moduleIds.length,
          modulesPassed: moduleIds.length,
          testsPassed: moduleIds.length + 1,
          testsFailed: 0,
          agentInvocations: moduleIds.length * 2 + 4,
        },
        diagnostics: [
          `Model: ${model}`,
          'Workflow: Architect -> Forge/Buster module DAG -> Echo -> approval -> final Buster -> final Echo',
        ],
      },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 60_000 },
    },
  );
  writeJson(pipelinePath, {
    schemaVersion: 'pipeline-definition.v2',
    id: 'kubeclaw:real-production-e2e',
    maxConcurrency: 4,
    stages,
  });
  const platform = loadPlatformConfig(platformPath);
  const definition = loadPipelineDefinition(pipelinePath);
  if (parsed['dry-run'] === 'true') {
    const validation = await validatePipelineRuntimeV2(platform, definition);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'real-production-pipeline-validation.v2',
      model,
      graphStageCount: stages.length,
      conditionalStageCount: stages.filter((stage) => stage.activation !== undefined).length,
      ...validation,
    })}\n`);
    return;
  }
  let result = parsed.resume === 'true'
    ? await recoverPipelineV2(platform, definition, runId)
    : await runPipelineV2(platform, definition, runId);
  while (result.status === 'waiting') {
    const waiting = [...result.stages.entries()].find(([, state]) => state.wait);
    if (!waiting?.[1].wait) throw new Error('REAL_E2E_APPROVAL_WAIT_MISSING');
    const [stageId, stageState] = waiting;
    if (stageId !== 'architecture-approval' && stageId !== 'operator-approval') {
      throw new Error(`REAL_E2E_UNEXPECTED_WAIT:${stageId}`);
    }
    const approval = stageState.wait;
    if (!approval) throw new Error(`REAL_E2E_APPROVAL_WAIT_MISSING:${stageId}`);
    const approvalState = path.join(
      swarm,
      stageId === 'architecture-approval'
        ? 'architecture-approval-gate-status.json'
        : 'operator-approval-gate-status.json',
    );
    writeJson(approvalState, {
      schema_version: 'real_e2e_approval_state.v2',
      project: projectName,
      run_id: runId,
      gate_id: stageId,
      gate_type: 'approval',
      status: 'PENDING_APPROVAL',
      requested_at: new Date().toISOString(),
      wait_id: approval.waitId,
    });
    const signal = await waitForOperator(
      approvalState,
      approval.waitId,
      approval.signalType,
    );
    result = await resumePipelineV2(platform, definition, runId, signal);
  }
  const output = {
    schemaVersion: 'real-production-pipeline-result.v2',
    runId,
    status: result.status,
    model,
    scenario: {
      id: String(progress.real_e2e?.scenario_id ?? 'success'),
      expectedEvidence: String(progress.real_e2e?.expected_evidence ?? 'success'),
    },
    stages: Object.fromEntries([...result.stages].map(([id, state]) => [id, state.status])),
    stateRoot,
    artifactRoot: artifacts,
    gitHead: git(repo, 'rev-parse', 'HEAD'),
    gitLog: git(repo, '--no-pager', 'log', '--oneline', '-12'),
  };
  writeJson(path.join(swarm, 'real-production-result.json'), output);
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = result.status === 'succeeded' ? 0 : 1;
}

const runtimeKeepAlive = setInterval(() => {}, 1_000);
try {
  await main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: 'error',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
} finally {
  clearInterval(runtimeKeepAlive);
}
