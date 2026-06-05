import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-operator-alert-surface' });
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();

const moduleRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.ts'), 'utf8');
const moduleRunnerBusterPhaseSource = [
  path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase.ts'),
  path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/spawn-failure.ts'),
].map((sourcePath) => fs.readFileSync(sourcePath, 'utf8')).join('\n');
const pipelineRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner.ts'), 'utf8');
const pipelineRunnerTerminalSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-terminal.ts'), 'utf8');
const telemetrySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry.ts'), 'utf8');
const observabilitySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/observability.ts'), 'utf8');
const telemetryDispatchSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry/dispatch.ts'), 'utf8');
const telemetrySinkDispatchSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry-sink-dispatch.ts'), 'utf8');
const notificationContractSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/notification-contract.ts'), 'utf8');
const notificationDispatchSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/notification-dispatch.ts'), 'utf8');
const discordIntegrationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/integrations/discord.ts'), 'utf8');
const sinkContractSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry-sink-contract.ts'), 'utf8');
const rateLimitSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit.ts'), 'utf8');
const pollingDualSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/polling-dual.ts'), 'utf8');
const pollingSessionEndSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/polling-session-end.ts'), 'utf8');
const busterGateCompletionSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-completion.ts'), 'utf8');
const pipelineRecoverySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.ts'), 'utf8');
const pipelineLockSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-lock.ts'), 'utf8');

assert.equal(
  `${moduleRunnerSource}\n${moduleRunnerBusterPhaseSource}`.includes("emitOperatorAlert(_telemetryCtx(config), 'module.operator_alert'"),
  true,
  'module-runner should route operator-only alerts through emitOperatorAlert',
);
assert.equal(`${pipelineRunnerSource}\n${pipelineRunnerTerminalSource}`.includes("emitOperatorAlert(ctx, 'pipeline.operator_alert'"), true, 'pipeline-runner should route terminal pipeline alerts through emitOperatorAlert');
assert.equal(telemetrySource.includes('operatorFallback'), false, 'telemetry spine must not keep a direct Discord fallback path');
assert.equal(telemetrySource.includes('appendDurableOperatorAlert'), true, 'telemetry spine should write local durable operator alerts before sink dispatch');
assert.equal(telemetrySource.includes('direct fallback path'), false, 'telemetry spine comments should avoid ambiguous direct fallback wording');
assert.equal(telemetryDispatchSource.includes('dispatchTelemetrySinks'), true, 'telemetry spine should route operator presentation through registry-owned telemetry sinks');
assert.equal(observabilitySource.includes('createObservabilityHealthState'), true, 'central observability controller should use shared degraded/restored health state');
for (const [label, source] of Object.entries({ telemetrySinkDispatchSource, notificationContractSource, notificationDispatchSource, discordIntegrationSource })) {
  for (const deleted of ['_structuredEventHealth', '_telemetrySinkIncidents', '_telemetrySinkHealth', '_notificationDispatchIncidents', '_discordWebhookHealth', '_discordAuditHealth']) {
    assert.equal(source.includes(deleted), false, `${label} must not keep localized observability health state ${deleted}`);
  }
}
assert.equal(sinkContractSource.includes('sinkId: \'discord\''), true, 'Discord operator delivery should be a built-in telemetry sink plugin');
assert.equal(rateLimitSource.includes('appendDurableRateLimitExhaustionAlert'), false, 'rate-limit main wrapper must not keep duplicate durable exhaustion alert logic');
assert.equal(rateLimitSource.includes('finalizeSessionRateLimitExhaustion'), true, 'rate-limit exhaustion should route through the central finalizer for durable terminal alert evidence');
assert.equal(`${pollingDualSource}\n${busterGateCompletionSource}`.includes('completion_event_adapter_failed'), true, 'completion adapter fatal paths should keep explicit terminal reason');
assert.equal(`${pollingDualSource}\n${busterGateCompletionSource}`.includes('appendDurableOperatorAlert'), true, 'completion adapter fatal/timeout paths should write durable terminal alert evidence');
assert.equal(pollingSessionEndSource.includes('appendDurableSessionEndAlert'), true, 'ACP session timeout/nudge failures should write durable terminal alert evidence');
assert.equal(pipelineLockSource.includes('appendDurableRunLockAlert'), true, 'pipeline run lock conflicts should write durable CRITICAL alert evidence before throwing');
assert.equal(pipelineRecoverySource.includes("from './pipeline-runner-lock.ts'"), true, 'pipeline recovery surface should re-export lock alert behavior');

const telemetryMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/services/telemetry.ts')).href);
const registryMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts')).href);
const runtimeMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/core/runtime.ts')).href);

const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
assert.equal(errors.length, 0);

const directAlertRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-alert-contract-'));
const directLogDir = path.join(directAlertRoot, 'logs');
const directRunLogDir = path.join(directLogDir, 'pipeline', 'runs', 'run-operator-alert-1');
const directRunAlertPath = path.join(directRunLogDir, 'operator-alerts.jsonl');
const directCalls = [];
const directDeps = {
  discord: async (_config, level, title, description, fields = []) => {
    assert.equal(fs.existsSync(directRunAlertPath), true, 'durable operator alert should be written before Discord dispatch');
    directCalls.push({ level, title, description, fields });
  },
};
await telemetryMod.emitOperatorAlert({
  config: {
    project: 'behavior-operator-alert',
    telemetry: { enabled: false },
    paths: { swarm_dir: directAlertRoot },
    _runId: 'run-operator-alert-1',
    run_id: 'run-operator-alert-1',
    _runStats: runtimeMod.createRunStats('2026-04-25T00:00:00.000Z'),
    pluginRegistry: registry,
  },
  deps: directDeps,
}, 'module.operator_alert', {
  module_id: '01',
  phase: 'forge',
  attempt: 1,
  detail: 'token=ghp_123456789012345678901234567890123456',
  prompt: 'raw transcript-like operator evidence',
}, {
  moduleId: '01',
  attempt: 1,
  presentation: {
    discord: {
      level: 'WARN',
      title: 'Module 01 — Forge no changes',
      description: 'Forge completed without file changes',
      fields: [{ name: 'Module', value: '01' }],
    },
  },
});

assert.equal(directCalls.length, 1, 'emitOperatorAlert should dispatch exactly one operator alert through the Discord telemetry sink');
assert.equal(directCalls[0].title, 'Module 01 — Forge no changes');
assert.equal(directCalls[0].description, 'Forge completed without file changes');
assert.equal(directCalls[0].fields[0].name, 'Module');
assert.equal(directCalls[0].fields[0].value, '01');
const directRunAlert = fs.readFileSync(directRunAlertPath, 'utf8');
assert.equal(directRunAlert.includes('ghp_123456789012345678901234567890123456'), false, 'durable alert payload should be redacted at source');
assert.equal(directRunAlert.includes('raw transcript-like operator evidence'), false, 'sensitive durable alert fields should be summarized, not written raw');
assert.equal(fs.existsSync(path.join(directLogDir, 'pipeline', 'operator-alerts.jsonl')), true, 'pipeline-scoped durable alert mirror should be written');

const fallbackCalls = [];
const fallbackDeps = {
  discord: async (_config, level, title, description, fields = []) => {
    fallbackCalls.push({ level, title, description, fields });
  },
};
const fallbackAlertRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-alert-fallback-contract-'));
await telemetryMod.onGateFail({
  config: {
    project: 'behavior-operator-fallback',
    telemetry: { enabled: false },
    paths: { swarm_dir: fallbackAlertRoot },
    _runId: 'run-operator-fallback-1',
    run_id: 'run-operator-fallback-1',
    _runStats: runtimeMod.createRunStats('2026-04-25T00:00:00.000Z'),
    pluginRegistry: registry,
  },
  deps: fallbackDeps,
}, 'gate:buster', {
  gate_type: 'buster',
  reason: "Gate 'gate:buster' spawn failed: spawn unavailable",
  presentation: {
    discord: {
      level: 'CRITICAL',
      title: "Gate 'gate:buster' Spawn Failed",
      description: 'Buster agent could not be spawned: spawn unavailable',
      fields: [{ name: 'Gate', value: 'gate:buster' }],
    },
  },
});

assert.equal(fallbackCalls.length, 1, 'onGateFail should deliver operator presentation through the Discord telemetry sink');
assert.equal(fallbackCalls[0].title, "Gate 'gate:buster' Spawn Failed");
assert.equal(fallbackCalls[0].fields[0].name, 'Gate');
assert.equal(fallbackCalls[0].fields[0].value, 'gate:buster');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 14 }));
