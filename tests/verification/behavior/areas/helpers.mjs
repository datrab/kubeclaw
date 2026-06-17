import fs from 'fs';
import assert from 'assert';

import { importRuntimeModule } from '../../lib/lifecycle-audit-lib.mjs';

export async function buildBuiltInRegistry(runtimeRoot) {
  const registryMod = await importRuntimeModule(runtimeRoot, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

export function gateRuntimeEvents(xaddEvents, streamKey) {
  return xaddEvents(streamKey)
    .filter((event) => !String(event.type || '').startsWith('plugin.gate.'))
    .map((event, index) => ({ ...event, seq: index + 1 }));
}

export function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function stepExit(result) {
  const status = result?.terminal?.status ?? result?.terminal_status ?? null;
  return status === 'succeeded' ? 0 : (status ? 1 : null);
}

export function stepGateStatus(result) {
  return result?.diagnostics?.typed?.controlResult?.diagnostics?.typed?.gate?.gateRunStatus;
}

export function stepMetadata(result) {
  return result?.diagnostics?.metadata || {};
}

export function stepRateLimit(result) {
  return result?.rateLimit || {};
}

export function stepSummary(result) {
  return result?.diagnostics?.summary;
}

export function platformTestDefaults() {
  return {
    fallback_model: 'fallback-model',
    rate_limit: { max_pauses_per_module: 3, cooldown_hours: 0 },
    review_defaults: { timeout_minutes: 30, max_fix_cycles: 3, lint_tier: 'full', lint_required: false },
  };
}

export function stepOutcomeForClass(outcomeClass = 'passed') {
  switch (outcomeClass) {
    case 'passed': return ['continue', 'passed', 'succeeded', 'none'];
    case 'needs_nova': return ['halt', 'needs_nova', 'action_required', 'request_handoff'];
    case 'blocked': return ['halt', 'blocked', 'blocked', 'notify_operator'];
    case 'timeout': return ['halt', 'timeout', 'timed_out', 'request_handoff'];
    case 'rate_limited': return ['halt', 'rate_limited', 'rate_limited', 'retry_later'];
    default: return ['halt', 'error', 'failed', 'stop'];
  }
}

export function makeStepResult({
  stepType = 'module',
  stepId = '01',
  outcomeClass = 'passed',
  reason = null,
  status = null,
  projection = {},
  correlation = {},
  issueType = null,
  rateLimit = null,
} = {}) {
  const [nextAction, outcome, terminalStatus, terminalAction] = stepOutcomeForClass(outcomeClass);
  return {
    schemaVersion: 'v1',
    kind: 'pipeline_step_result',
    stepType,
    stepId,
    nextAction,
    outcome,
    ...(issueType ? { issueType } : {}),
    diagnostics: {
      summary: reason,
      findings: [],
      metadata: {
        ...projection,
        ...(reason != null ? { reason } : {}),
        ...(status != null ? { status } : {}),
      },
      typed: {},
    },
    correlation,
    ...(rateLimit == null ? {} : { rateLimit }),
    terminal: {
      status: terminalStatus,
      decision: {
        schemaVersion: 'v1',
        kind: 'pipeline_terminal_decision',
        status: terminalStatus,
        action: terminalAction,
        reasonCode: outcome,
        humanReason: reason,
        scope: stepType,
        correlation: {},
        source: null,
        metadata: {},
      },
    },
  };
}

export function assertTypedTerminalEvent(event, status, reasonCode = undefined) {
  assert.equal(event.terminal_status, status);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exit_code'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exit_reason'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exitCode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, 'exitLabel'), false);
  if (reasonCode !== undefined) assert.equal(event.reason_code, reasonCode);
}
