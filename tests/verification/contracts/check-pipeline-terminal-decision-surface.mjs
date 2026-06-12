import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-terminal-decision-surface' });
import fs from 'fs';
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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/terminal-decision.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');

for (const marker of [
  'export const PIPELINE_TERMINAL_DECISION_SCHEMA_VERSION',
  'export const PIPELINE_TERMINAL_DECISION_KIND',
  'export const PIPELINE_TERMINAL_STATUSES',
  'export const PIPELINE_TERMINAL_ACTIONS',
  'export const PIPELINE_TERMINAL_SCOPES',
  'export function buildPipelineTerminalDecision(',
  'export function buildPipelineTerminalDecisionFromStepOutcome(',
  'export function validatePipelineTerminalDecision(',
  'export function assertPipelineTerminalDecision(',
  'export function isPipelineTerminalDecision(',
  'export function pipelineTerminalStatusForStepOutcome(',
]) {
  assert.equal(helperSource.includes(marker), true, `terminal decision helper must export ${marker}`);
}

for (const forbidden of [
  'DEFAULT_ACTION_BY_STATUS',
  'pipelineTerminalDefaultActionForStatus',
  'EXIT_OK',
  'EXIT_ERROR',
  'EXIT_NEEDS_NOVA',
  'EXIT_BLOCKED',
  'EXIT_TIMEOUT',
  'EXIT_RATE_LIMITED',
  'terminalStatusToProcessExit',
  'processExit',
  'exitCodeForStatus',
]) {
  assert.equal(helperSource.includes(forbidden), false, `terminal decision helper must not expose ${forbidden}`);
}

const helperMod = await import(pathToFileURL(helperPath).href);

assert.equal(Object.isFrozen(helperMod.PIPELINE_TERMINAL_STATUSES), true, 'terminal statuses registry should be frozen');
assert.equal(Object.isFrozen(helperMod.PIPELINE_TERMINAL_ACTIONS), true, 'terminal actions registry should be frozen');
assert.equal(Object.isFrozen(helperMod.PIPELINE_TERMINAL_SCOPES), true, 'terminal scopes registry should be frozen');
assert.deepEqual(Object.values(helperMod.PIPELINE_TERMINAL_STATUSES), [
  'succeeded',
  'failed',
  'paused',
  'blocked',
  'action_required',
  'timed_out',
  'rate_limited',
  'cancelled',
]);

assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('passed'), 'succeeded');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('needs_nova'), 'action_required');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('blocked'), 'blocked');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('error'), 'failed');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('timeout'), 'timed_out');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('rate_limited'), 'rate_limited');
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('retrying'), null);
assert.equal(helperMod.pipelineTerminalStatusForStepOutcome('fix_requested'), null);

const actionRequired = helperMod.buildPipelineTerminalDecision({
  status: 'ACTION REQUIRED',
  action: 'request_handoff',
  reasonCode: 'Needs Nova',
  humanReason: 'Fix cycles exhausted',
  scope: 'gate',
  runId: 'run-1',
  gateId: 'quality',
  attempt: '2',
  dispatchId: 'dispatch-1',
  sessionKey: 'session-1',
  source: 'gate:quality',
  metadata: { owner: 'gate' },
});
assert.equal(helperMod.isPipelineTerminalDecision(actionRequired), true);
assert.deepEqual(helperMod.validatePipelineTerminalDecision(actionRequired), []);
assert.equal(actionRequired.status, 'action_required');
assert.equal(actionRequired.action, 'request_handoff');
assert.equal(actionRequired.reasonCode, 'needs_nova');
assert.equal(actionRequired.scope, 'gate');
assert.equal(actionRequired.correlation.run_id, 'run-1');
assert.equal(actionRequired.correlation.gate_id, 'quality');
assert.equal(actionRequired.correlation.attempt, 2);
assert.equal(actionRequired.metadata.owner, 'gate', 'terminal decision metadata should stay diagnostic without numeric exit compatibility');
assert.equal(actionRequired.exit, undefined, 'terminal decision must not expose numeric exit');
assert.equal(actionRequired.exitCode, undefined, 'terminal decision must not expose numeric exitCode');
assert.equal(actionRequired.exit_code, undefined, 'terminal decision must not expose numeric exit_code');

const moduleTimeout = helperMod.buildPipelineTerminalDecisionFromStepOutcome({
  outcome: 'timeout',
  action: 'request_handoff',
  scope: 'module',
  humanReason: 'Module timed out',
  stepId: '01',
  runId: 'run-2',
  sessionKey: 'session-2',
});
assert.equal(moduleTimeout.status, 'timed_out');
assert.equal(moduleTimeout.action, 'request_handoff');
assert.equal(moduleTimeout.scope, 'module');
assert.equal(moduleTimeout.correlation.module_id, '01');
assert.equal(moduleTimeout.reasonCode, 'timeout');

const validatorBlock = helperMod.buildPipelineTerminalDecisionFromStepOutcome({
  outcome: 'blocked',
  action: 'notify_operator',
  scope: 'validator',
  stepId: 'arch-validator:01',
  runId: 'run-validator',
});
assert.equal(validatorBlock.status, 'blocked');
assert.equal(validatorBlock.scope, 'validator');
assert.equal(validatorBlock.correlation.validator_id, 'arch-validator:01');

assert.equal(helperMod.buildPipelineTerminalDecisionFromStepOutcome({ outcome: 'retrying' }), null, 'non-terminal outcomes should not produce terminal decisions');

assert.throws(
  () => helperMod.buildPipelineTerminalDecisionFromStepOutcome({ outcome: 'blocked', scope: 'module', stepId: '01' }),
  /action must be one of:/,
  'terminal decisions built from step outcomes must receive an explicit action',
);

assert.throws(
  () => helperMod.buildPipelineTerminalDecisionFromStepOutcome({ outcome: 'blocked', action: 'notify_operator', stepId: '01' }),
  /scope must be one of:/,
  'terminal decisions built from step outcomes must receive an explicit scope',
);

assert.throws(
  () => helperMod.buildPipelineTerminalDecision({ status: 'exit_10', reasonCode: 'legacy' }),
  /status must be one of:/,
  'terminal decision status must be typed, not numeric-exit language',
);

assert.throws(
  () => helperMod.buildPipelineTerminalDecision({ status: 'blocked', action: 'notify_operator' }),
  /scope must be one of:/,
  'terminal decision scope must be explicit',
);

assert.deepEqual(
  helperMod.validatePipelineTerminalDecision({ ...actionRequired, exitCode: 10 }),
  ['terminal decision must not carry numeric exitCode'],
  'validated terminal decisions should reject numeric process projection fields',
);

assert.throws(
  () => helperMod.buildPipelineTerminalDecision({ status: 'blocked', action: 'exit_20' }),
  /action must be one of:/,
  'terminal decision action must be typed, not a process exit action',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'pipeline-terminal-decision' }));
