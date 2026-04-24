#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import assert from 'assert';
import { execFileSync } from 'child_process';
import {
  parseArgs,
  resolveRoots,
  resolveTelemetryContractPath,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
} from '../lib/lifecycle-audit-lib.mjs';
import { registerGovernanceArea } from './areas/governance.mjs';
import { registerGatesArea } from './areas/gates.mjs';
import { registerSummariesArea } from './areas/summaries.mjs';
import { registerPipelineArea } from './areas/pipeline.mjs';
import { registerFixCyclesArea } from './areas/fix-cycles.mjs';
import { registerStopsArea } from './areas/stops.mjs';
import { registerModelsArea } from './areas/models.mjs';
import { registerFoundationsArea } from './areas/foundations.mjs';
import { registerPollingArea } from './areas/polling.mjs';
import { registerTelemetryArea } from './areas/telemetry.mjs';
import { registerApprovalsArea } from './areas/approvals.mjs';
import { registerModuleFailuresArea } from './areas/module-failures.mjs';
import { registerRuntimeSurfaceArea } from './areas/runtime-surface.mjs';
import { registerDocsSurfaceArea } from './areas/docs-surface.mjs';
import { registerOperatorSurfaceArea } from './areas/operator-surface.mjs';
import { registerDiscordCorrelationArea } from './areas/discord-correlation.mjs';
import { registerRepoDocsArea } from './areas/repo-docs.mjs';
import { registerTelemetryDocsArea } from './areas/telemetry-docs.mjs';
import { registerTelemetrySchemaArea } from './areas/telemetry-schema.mjs';
import { registerDeploymentSurfaceArea } from './areas/deployment-surface.mjs';
import { registerTranscriptMonitorArea } from './areas/transcript-monitor.mjs';
import { registerRuntimeMonitorArea } from './areas/runtime-monitor.mjs';
import { registerAgentLifecycleArea } from './areas/agent-lifecycle.mjs';
import { registerRestartRecoveryArea } from './areas/restart-recovery.mjs';
import { registerShutdownIntegrationArea } from './areas/shutdown-integration.mjs';
import { registerGateSessionPersistenceArea } from './areas/gate-session-persistence.mjs';
import { registerBusterRuntimeNormalizationArea } from './areas/buster-runtime-normalization.mjs';
import { registerLifecycleStateSurfaceArea } from './areas/lifecycle-state-surface.mjs';
import { registerRedactionSurfaceArea } from './areas/redaction-surface.mjs';
import { registerShellBoundaryArea } from './areas/shell-boundary.mjs';
import { registerResumeIdempotenceArea } from './areas/resume-idempotence.mjs';
import { registerSeqRestartArea } from './areas/seq-restart.mjs';
import { registerManyModuleSoakArea } from './areas/many-module-soak.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const contractPath = resolveTelemetryContractPath(args, sourceRoot);

const AREA_ORDER = [
  'foundations',
  'polling',
  'telemetry',
  'approvals',
  'governance',
  'gates',
  'summaries',
  'pipeline',
  'fix-cycles',
  'stops',
  'models',
  'module-failures',
  'runtime-surface',
  'redaction-surface',
  'shell-boundary',
  'resume-idempotence',
  'seq-restart',
  'many-module-soak',
  'docs-surface',
  'operator-surface',
  'discord-correlation',
  'repo-docs',
  'telemetry-docs',
  'telemetry-schema',
  'deployment-surface',
  'transcript-monitor',
  'runtime-monitor',
  'agent-lifecycle',
  'restart-recovery',
  'shutdown-integration',
  'gate-session-persistence',
  'buster-runtime-normalization',
  'lifecycle-state-surface',
];

function printUsage() {
  console.error(`Behavior verification harness

Usage:
  node tests/verification/behavior/verify.mjs [options]

Options:
  --source-root <path>   Source tree to verify (defaults to cwd)
  --overlay-root <path>  Optional overlay tree layered over source-root
  --contract <path>      Telemetry contract markdown to validate against
  --areas <list>         Comma-separated verification areas to run
  --area <name>          Alias for a single verification area
  --list-areas           Print the supported verification areas as JSON
  --help                 Show this help
`);
}

function resolveSelectedAreas(rawArgs = {}) {
  const rawSelection = rawArgs.areas || rawArgs.area || null;
  if (!rawSelection) return [...AREA_ORDER];

  const requested = [...new Set(String(rawSelection)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))];

  const unknown = requested.filter((name) => !AREA_ORDER.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown behavior verification area(s): ${unknown.join(', ')}. Supported areas: ${AREA_ORDER.join(', ')}`);
  }

  return requested;
}

if (args.help) {
  printUsage();
  process.exit(0);
}

if (args['list-areas']) {
  console.log(JSON.stringify({ areas: AREA_ORDER }, null, 2));
  process.exit(0);
}

const selectedAreas = resolveSelectedAreas(args);
const selectedAreaSet = new Set(selectedAreas);

function assertBehaviorVerifierPrereqs() {
  try {
    execFileSync('python', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Behavior verifier prerequisite missing: `python` is required on PATH. ' +
      'This harness exercises representative pipeline fixtures that invoke `python -m ...`. ' +
      'Install Python with a `python` alias (for Debian/Ubuntu: `python3` + `python-is-python3`) ' +
      'or run inside the environment built from `docker/Dockerfile.general`.'
    );
  }
}

assertBehaviorVerifierPrereqs();

// Verification must not hit live Discord webhooks. Discord behavior should be
// asserted through explicit notification-focused checks, not generic behavior harness runs.
process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '1';

const checks = [];

async function record(name, fn) {
  await fn();
  checks.push(name);
}

async function startGatewayServer(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const payload = await handler({ req, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function installFakeRedis(runtimeRoot) {
  const nodeModulesDir = ensureDir(path.join(runtimeRoot, 'node_modules', 'ioredis'));
  fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), `
function counters() {
  return globalThis.__fakeRedisCounters ||= Object.create(null);
}
function calls() {
  return globalThis.__fakeRedisCalls ||= [];
}
class FakeRedis {
  constructor() {
    this.status = 'ready';
  }
  on() {}
  async incr(key) {
    const store = counters();
    store[key] = (store[key] || 0) + 1;
    calls().push({ op: 'incr', key, value: store[key] });
    return store[key];
  }
  async xadd(...args) {
    calls().push({ op: 'xadd', args });
    return '1-0';
  }
  async expire(...args) {
    calls().push({ op: 'expire', args });
    return 1;
  }
  multi() {
    const ops = [];
    const chain = {
      xadd: (...args) => { ops.push({ op: 'xadd', args }); return chain; },
      expire: (...args) => { ops.push({ op: 'expire', args }); return chain; },
      exec: async () => { calls().push(...ops); return ops; },
    };
    return chain;
  }
  async quit() { calls().push({ op: 'quit' }); }
}
module.exports = FakeRedis;
`);
  fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{"name":"ioredis","main":"index.js"}');
}

function xaddEvents(prefix) {
  const calls = globalThis.__fakeRedisCalls || [];
  return calls
    .filter((entry) => entry.op === 'xadd' && String(entry.args?.[0] || '').startsWith(prefix))
    .map((entry) => {
      const dataIndex = entry.args.indexOf('data');
      return JSON.parse(entry.args[dataIndex + 1]);
    });
}

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
const { runtimeRoot: sandboxRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
const pipelineEntryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline.js');
const pipelineIndexMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/index.js');
const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.js');
const contextMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/context.js');
const coreRuntimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.js');
const pipelineRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner.js');
const orchestrationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/orchestration.js');
const pipelineRedisMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/tools/redis.js');
const runtimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/runtime.js');
const gatewayMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/integrations/gateway.js');
const discordMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/integrations/discord.js');
const lifecycleMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/lifecycle.js');
const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.js');
const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.js');
const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.js');
const monitorMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/acp-monitor.js');
const redisLogMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/redis-log.js');
const artifactBundleMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/artifact-bundle.js');
const correlationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/correlation.js');
const pathsMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/paths.js');
const busterPipelineMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/buster-pipeline.js');

const sharedAreaDeps = {
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  registryMod,
  contextMod,
  coreRuntimeMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  statusStoreMod,
  rateLimitMod,
  monitorMod,
  redisLogMod,
  artifactBundleMod,
  correlationMod,
  pathsMod,
  busterPipelineMod,
};

const areaRegistrars = [
  ['foundations', () => registerFoundationsArea(sharedAreaDeps)],
  ['polling', () => registerPollingArea(sharedAreaDeps)],
  ['telemetry', () => registerTelemetryArea(sharedAreaDeps)],
  ['approvals', () => registerApprovalsArea(sharedAreaDeps)],
  ['governance', () => registerGovernanceArea({ record, sourceRoot, overlayRoot, installFakeRedis })],
  ['gates', () => registerGatesArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['summaries', () => registerSummariesArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['pipeline', () => registerPipelineArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['fix-cycles', () => registerFixCyclesArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['stops', () => registerStopsArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['models', () => registerModelsArea({ record, sourceRoot, overlayRoot, installFakeRedis, flushAsync, xaddEvents })],
  ['module-failures', () => registerModuleFailuresArea(sharedAreaDeps)],
  ['runtime-surface', () => registerRuntimeSurfaceArea(sharedAreaDeps)],
  ['redaction-surface', () => registerRedactionSurfaceArea(sharedAreaDeps)],
  ['shell-boundary', () => registerShellBoundaryArea(sharedAreaDeps)],
  ['resume-idempotence', () => registerResumeIdempotenceArea(sharedAreaDeps)],
  ['seq-restart', () => registerSeqRestartArea(sharedAreaDeps)],
  ['many-module-soak', () => registerManyModuleSoakArea(sharedAreaDeps)],
  ['docs-surface', () => registerDocsSurfaceArea(sharedAreaDeps)],
  ['operator-surface', () => registerOperatorSurfaceArea(sharedAreaDeps)],
  ['discord-correlation', () => registerDiscordCorrelationArea(sharedAreaDeps)],
  ['repo-docs', () => registerRepoDocsArea(sharedAreaDeps)],
  ['telemetry-docs', () => registerTelemetryDocsArea(sharedAreaDeps)],
  ['telemetry-schema', () => registerTelemetrySchemaArea(sharedAreaDeps)],
  ['deployment-surface', () => registerDeploymentSurfaceArea(sharedAreaDeps)],
  ['transcript-monitor', () => registerTranscriptMonitorArea(sharedAreaDeps)],
  ['runtime-monitor', () => registerRuntimeMonitorArea(sharedAreaDeps)],
  ['agent-lifecycle', () => registerAgentLifecycleArea(sharedAreaDeps)],
  ['restart-recovery', () => registerRestartRecoveryArea(sharedAreaDeps)],
  ['shutdown-integration', () => registerShutdownIntegrationArea(sharedAreaDeps)],
  ['gate-session-persistence', () => registerGateSessionPersistenceArea(sharedAreaDeps)],
  ['buster-runtime-normalization', () => registerBusterRuntimeNormalizationArea(sharedAreaDeps)],
  ['lifecycle-state-surface', () => registerLifecycleStateSurfaceArea(sharedAreaDeps)],
];

for (const [areaName, registerArea] of areaRegistrars) {
  if (!selectedAreaSet.has(areaName)) continue;
  await registerArea();
}

console.log(JSON.stringify({
  sourceRoot,
  overlayRoot,
  selectedAreas,
  passed: checks.length,
  failed: 0,
  checks,
}, null, 2));
