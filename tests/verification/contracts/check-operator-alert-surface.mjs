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

function listFiles(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function directDiscordCallsMissingCorrelation(source) {
  const misses = [];
  let index = 0;
  while ((index = source.indexOf('discord(', index)) !== -1) {
    const end = findCallEnd(source, index);
    if (end <= index) {
      index += 'discord('.length;
      continue;
    }
    const call = source.slice(index, end);
    const args = splitTopLevelArgs(call.slice(call.indexOf('(') + 1, -1));
    const hasStructuredCorrelationOption = topLevelObjectHasProperty(args[5], 'correlation');
    if (call.includes('buildDiscordIdentitySurfaceFields') && !hasStructuredCorrelationOption) {
      misses.push(source.slice(0, index).split('\n').length);
    }
    index = Math.max(end, index + 1);
  }
  return misses;
}

function findCallEnd(source, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function splitTopLevelArgs(argsSource) {
  const args = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < argsSource.length; i += 1) {
    const char = argsSource[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      args.push(argsSource.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = argsSource.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function topLevelObjectHasProperty(objectSource = '', propertyName) {
  const source = String(objectSource || '').trim();
  if (!source.startsWith('{') || !source.endsWith('}')) return false;
  const properties = splitTopLevelArgs(source.slice(1, -1));
  return properties.some((property) => {
    const token = property.trim();
    return token === propertyName
      || token.startsWith(`${propertyName}:`)
      || token.startsWith(`${propertyName} `)
      || token.startsWith(`'${propertyName}':`)
      || token.startsWith(`"${propertyName}":`);
  });
}

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
const discordFieldsContractSource = fs.readFileSync(path.join(sourceRoot, 'skills/common/pipeline/services/discord-fields-contract.ts'), 'utf8');
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
assert.equal(discordIntegrationSource.includes('extractDiscordCorrelation'), false, 'Discord audit correlation must come from structured correlation input, not rendered fields');
assert.equal(discordIntegrationSource.includes('extractDiscordBatchCorrelation'), false, 'Discord batch audit correlation must come from structured correlation input, not rendered embed fields');
assert.equal(discordIntegrationSource.includes('correlation_key'), false, 'Discord integration must not read rendered field correlation metadata');
assert.equal(discordFieldsContractSource.includes('correlation_key'), false, 'Discord identity fields must stay presentational and not carry hidden correlation metadata');
for (const filePath of listFiles(path.join(sourceRoot, 'skills/nova/pipeline'), (candidate) => candidate.endsWith('.ts'))) {
  const relativePath = path.relative(sourceRoot, filePath);
  const missing = directDiscordCallsMissingCorrelation(fs.readFileSync(filePath, 'utf8'));
  assert.deepEqual(missing, [], `${relativePath} direct Discord identity fields require explicit structured correlation`);
}
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
    discord: async (_config, level, title, description, fields = [], opts = {}) => {
      fallbackCalls.push({ level, title, description, fields, opts });
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
  assert.equal(fallbackCalls[0].opts.correlation.run_id, 'run-operator-fallback-1');
  assert.equal(fallbackCalls[0].opts.correlation.gate_id, 'gate:buster');
  assert.equal(fallbackCalls[0].opts.correlation.gate_type, 'buster');

  await telemetryMod.onGatePass({
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
    dispatch_id: 'dispatch-buster-pass-1',
    gateway_label: 'buster-gateway-pass-1',
    session_key: 'agent:buster:gate-pass-1',
    presentation: {
      discord: {
        level: 'OK',
        title: "Gate 'gate:buster' PASS",
        description: 'Passed on first run',
        fields: [{ name: 'Gate', value: 'gate:buster' }],
      },
    },
  });

  assert.equal(fallbackCalls.length, 2, 'onGatePass should deliver operator presentation through the Discord telemetry sink');
  assert.equal(fallbackCalls[1].title, "Gate 'gate:buster' PASS");
  assert.equal(fallbackCalls[1].opts.correlation.run_id, 'run-operator-fallback-1');
  assert.equal(fallbackCalls[1].opts.correlation.gate_id, 'gate:buster');
  assert.equal(fallbackCalls[1].opts.correlation.gate_type, 'buster');
  assert.equal(fallbackCalls[1].opts.correlation.dispatch_id, 'dispatch-buster-pass-1');
  assert.equal(fallbackCalls[1].opts.correlation.gateway_label, 'buster-gateway-pass-1');
  assert.equal(fallbackCalls[1].opts.correlation.session_key, 'agent:buster:gate-pass-1');

  quietConsole.restore();
  console.log(JSON.stringify({ ok: true, checked: 15 }));
