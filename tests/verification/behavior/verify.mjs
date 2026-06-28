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
  runGateViaRegistry,
  ensureDir,
  writeExecutable,
} from '../lib/lifecycle-audit-lib.mjs';
import {
  installFakeRedis,
  xaddEvents,
  flushAsync,
} from '../lib/fake-redis-lib.mjs';
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
import { registerMigratedSeamsArea } from './areas/migrated-seams.mjs';

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
  'migrated-seams',
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
  --verbose              Print runtime logs and passed check names
  --list-areas           Print the supported verification areas as JSON
  --help                 Show this help

By default, runtime logs are buffered per check and printed only when that
check fails. Set --verbose or VERIFICATION_VERBOSE=1 to stream all logs.
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
const verboseLogs = args.verbose === true || process.env.VERIFICATION_VERBOSE === '1';

function assertBehaviorVerifierPrereqs() {
  try {
    execFileSync('python', ['--version'], { stdio: 'ignore' });
  } catch (_error) {
    throw new Error(
      'Behavior verifier prerequisite missing: `python` is required on PATH. ' +
      'This harness exercises representative pipeline fixtures that invoke `python -m ...`. ' +
      'Install Python with a `python` alias (for Debian/Ubuntu: `python3` + `python-is-python3`) ' +
      'or run inside the environment built from `docker/Dockerfile.general`.'
    );
  }
}

function cleanupGeneratedVerificationSwarmArtifacts() {
  const roots = [...new Set([process.cwd(), sourceRoot].filter(Boolean).map((entry) => path.resolve(entry)))];
  for (const root of roots) {
    fs.rmSync(path.join(root, '.swarm'), { recursive: true, force: true });
  }
  execFileSync(path.join(sourceRoot, 'tests/verification/lib/cleanup-home-artifacts.sh'), { stdio: 'ignore' });
}

assertBehaviorVerifierPrereqs();
cleanupGeneratedVerificationSwarmArtifacts();

// Verification must not hit live Discord webhooks. Discord behavior should be
// asserted through explicit notification-focused checks, not generic behavior harness runs.
process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '1';

const checks = [];

function stringifyConsoleArgs(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    try { return JSON.stringify(value); }
    catch (_error) { return String(value); }
  }).join(' ');
}

async function record(name, fn) {
  if (verboseLogs) {
    await fn();
    checks.push(name);
    return;
  }

  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const bufferedOutput = [];
  const captureWrite = (chunk, encoding, callback) => {
    bufferedOutput.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };
  console.log = (...values) => { bufferedOutput.push(stringifyConsoleArgs(values)); };
  console.info = (...values) => { bufferedOutput.push(stringifyConsoleArgs(values)); };
  console.warn = (...values) => { bufferedOutput.push(stringifyConsoleArgs(values)); };
  console.error = (...values) => { bufferedOutput.push(stringifyConsoleArgs(values)); };
  process.stdout.write = captureWrite;
  process.stderr.write = captureWrite;
  try {
    await fn();
    await new Promise((resolve) => setImmediate(resolve));
    checks.push(name);
  } catch (error) {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    originalConsoleError(`[behavior] FAILED: ${name}`);
    if (bufferedOutput.length > 0) {
      originalConsoleError('[behavior] buffered runtime log output:');
      for (const line of bufferedOutput) originalConsoleError(line);
    }
    throw error;
  } finally {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
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

const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
const { runtimeRoot: sandboxRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'sandbox');
const pipelineEntryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline.ts');
const pipelineIndexMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/index.ts');
const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
const contextMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/context.ts');
const coreRuntimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/runtime.ts');
const pipelineRunnerMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/runners/pipeline-runner.ts');
const orchestrationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/orchestration.ts');
const pipelineRedisMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/tools/redis.ts');
const runtimeMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/runtime.ts');
const gatewayMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/integrations/gateway.ts');
const discordMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/integrations/discord.ts');
const lifecycleMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/lifecycle.ts');
const lifecycleStateMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/lifecycle-state.ts');
const statusStoreMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/status-store.ts');
const rateLimitMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/rate-limit.ts');
const monitorMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/agents/acp-monitor.ts');
const redisLogMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/redis-log.ts');
const telemetryServiceMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/telemetry.ts');
const artifactBundleMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/artifact-bundle.ts');
const correlationMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/services/correlation.ts');
const pathsMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/paths.ts');
const busterEntrypointMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/buster-pipeline.ts');
const busterPipelineHelpersMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/pipeline-helpers.ts');
const busterSessionMonitorMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/session-monitor.ts');
const busterTaskValidationMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/task-validation.ts');
const busterRuntimeDiagnosticsMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/runtime-diagnostics.ts');
const busterBaseImagesMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/base-images.ts');
const busterCapabilitiesMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/capabilities.ts');
const busterTaskQueueMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/task-queue.ts');
const busterRecoveryMod = await importRuntimeModule(sandboxRuntimeRoot, '/app/skills/pipeline/services/orphan-recovery.ts');

async function cleanupRuntimeResources() {
  await pipelineRedisMod.default?.disconnect?.();
  await telemetryServiceMod.closeTelemetryRedis?.();
}

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
  runGateViaRegistry,
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
  telemetryServiceMod,
  artifactBundleMod,
  correlationMod,
  pathsMod,
  busterEntrypointMod,
  busterPipelineHelpersMod,
  busterSessionMonitorMod,
  busterTaskValidationMod,
  busterRuntimeDiagnosticsMod,
  busterBaseImagesMod,
  busterCapabilitiesMod,
  busterTaskQueueMod,
  busterRecoveryMod,
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
  ['migrated-seams', () => registerMigratedSeamsArea(sharedAreaDeps)],
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

try {
  for (const [areaName, registerArea] of areaRegistrars) {
    if (!selectedAreaSet.has(areaName)) continue;
    await registerArea();
  }
} finally {
  await cleanupRuntimeResources();
  cleanupGeneratedVerificationSwarmArtifacts();
}

console.log(JSON.stringify({
  sourceRoot,
  overlayRoot,
  selectedAreas,
  verboseLogs,
  passed: checks.length,
  failed: 0,
  ...(verboseLogs ? { checks } : {}),
}, null, 2));
process.exit(0);
