import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-gate-control-result-surface' });
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
const genericMissingValueToken = ['unk', 'nown'].join('');
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/gate-control-result.ts');
const reviewControlPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-control.ts');
const busterControlPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-control.ts');
const busterTerminalPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-terminal.ts');
const approvalControlPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/approval-gate-control.ts');
const reviewRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts');
const busterRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts');
const approvalRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/approval-gate-runner.ts');
const gateRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.ts');
const remediableGateEnginePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/remediable-gate-engine.ts');
const waitableGateEnginePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/waitable-gate-engine.ts');
const scheduledGateInvocationPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/scheduled-gate-invocation.ts');
const remediationPath = path.join(sourceRoot, 'skills/nova/pipeline/services/remediation-handoff.ts');
const builtinsRegistryPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtins.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewControlSource = fs.readFileSync(reviewControlPath, 'utf8');
const busterControlSource = fs.readFileSync(busterControlPath, 'utf8');
const busterTerminalSource = fs.readFileSync(busterTerminalPath, 'utf8');
const approvalControlSource = fs.readFileSync(approvalControlPath, 'utf8');
const reviewRunnerSource = fs.readFileSync(reviewRunnerPath, 'utf8');
const busterRunnerSource = fs.readFileSync(busterRunnerPath, 'utf8');
const approvalRunnerSource = fs.readFileSync(approvalRunnerPath, 'utf8');
const gateRunnerSource = fs.readFileSync(gateRunnerPath, 'utf8');
const remediableGateEngineSource = fs.readFileSync(remediableGateEnginePath, 'utf8');
const waitableGateEngineSource = fs.readFileSync(waitableGateEnginePath, 'utf8');
const scheduledGateInvocationSource = fs.readFileSync(scheduledGateInvocationPath, 'utf8');
const remediationSource = fs.readFileSync(remediationPath, 'utf8');
const builtinsRegistrySource = fs.readFileSync(builtinsRegistryPath, 'utf8');

assert.equal(busterTerminalSource.includes('export const BUSTER_GATE_EVALUATION_RESULT_TYPES'), true, 'Buster gate terminal must expose typed evaluation result tags');
assert.equal(busterTerminalSource.includes('export function assertBusterGateEvaluationResult('), true, 'Buster gate terminal must classify raw poll results at one boundary');
assert.equal(busterTerminalSource.includes('result.reason ==='), false, 'Buster gate terminal must not branch directly on raw result.reason strings');
assert.equal(busterTerminalSource.includes('result.status || {}'), false, 'Buster gate terminal must consume typed evaluation status instead of raw status fallback');

for (const marker of [
  'export const GATE_CONTROL_ACTIONS =',
  'export const GATE_CONTROL_NEXT_ACTIONS',
  'export const REMEDIABLE_GATE_CONTROL_NEXT_ACTIONS',
  'export function cloneSerializable(',
  'export function buildTypedGateControlResult(',
  'export function isGateControlResult(',
  'export function isTypedGateControlResult(',
  'export function coerceTypedGateControlResult(',
  'export function validateGateControlResult(',
  'export function normalizeGateControlResult(',
  'export function validateTypedGateControlResult(',
  'export function normalizeTypedGateControlResult(',
  'export function validateRemediableTypedGateControlResult(',
  'export function normalizeRemediableTypedGateControlResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `shared gate control-result helper must export ${marker}`);
}

for (const forbidden of [
  'GATE_COMPATIBILITY_CONTROL_MAPPINGS',
  'mapGateCompatibilityResultToControl',
  'projectTypedGateCompatibilityResult',
  'projectReviewGateCompatibilityResult',
  'projectBusterGateCompatibilityResult',
  'projectApprovalGateCompatibilityResult',
  'projectCompatibilityResult',
  'finalizeGateCompatibilityResult',
  'compatibilityProjection',
  '../compatibility-authority.ts',
  "from './control-result-mapping.ts'",
]) {
  for (const [label, source] of [
    ['gate-control-result', helperSource],
    ['review-control', reviewControlSource],
    ['buster-control', busterControlSource],
    ['approval-control', approvalControlSource],
    ['review-runner', reviewRunnerSource],
    ['buster-runner', busterRunnerSource],
    ['approval-runner', approvalRunnerSource],
    ['gate-runner', gateRunnerSource],
    ['remediable-engine', remediableGateEngineSource],
    ['waitable-engine', waitableGateEngineSource],
    ['remediation-handoff', remediationSource],
  ]) {
    assert.equal(source.includes(forbidden), false, `${label} must not expose ${forbidden}`);
  }
}

assert.equal(gateRunnerSource.includes('buildPipelineStepResultFromControlResult('), true, 'gate-runner should build canonical step results from typed gate controls');
assert.equal(gateRunnerSource.includes('terminalReasonCode: outcome'), true, 'gate-runner terminal reason should use typed gate outcome, not diagnostic failure_class');
assert.equal(gateRunnerSource.includes('async function buildGateRuntimeErrorControl('), true, 'gate-runner should use one runtime-error control builder');
assert.equal(gateRunnerSource.includes('function isTimeoutError('), true, 'gate-runner should classify timeout-shaped runtime errors before terminal projection');
assert.equal(gateRunnerSource.includes("terminalReasonCode: diagnostics?.timed_out === true ? 'timeout'"), true, 'gate-runner runtime timeout failures must use the canonical timeout terminal reason');
assert.equal(gateRunnerSource.includes('function buildGateRuntimeErrorStepResult('), false, 'gate-runner must not keep a separate runtime-error step projection helper');
assert.equal(gateRunnerSource.includes('emitGateDispatchFailure('), false, 'gate-runner must not keep a separate dispatch failure projection path');
assert.equal(gateRunnerSource.includes('emitGateExecutionFailure('), false, 'gate-runner must not keep a separate execution failure projection path');
assert.equal(gateRunnerSource.includes('normalizeRemediableTypedGateControlResult('), true, 'gate-runner should normalize remediable gate controls through the shared helper');
assert.equal(gateRunnerSource.includes('normalizeTypedGateControlResult('), true, 'gate-runner should normalize waitable gate controls through the shared helper');
assert.equal(gateRunnerSource.includes("adapter.mode === 'waitable'"), true, 'gate-runner should route wait-capable gates through the generic waitable path');
assert.equal(scheduledGateInvocationSource.includes('export async function runScheduledGateInvocation('), true, 'scheduled gates should share one invocation/context builder');
assert.equal(scheduledGateInvocationSource.includes('scheduled gate invocation requires explicit stageId'), true, 'scheduled gate invocation helper should require explicit stage identity');
assert.equal(scheduledGateInvocationSource.includes('scheduled gate invocation requires explicit gateType'), true, 'scheduled gate invocation helper should require explicit gate type identity');
assert.equal(scheduledGateInvocationSource.includes('scheduled gate invocation requires explicit positive attempt'), true, 'scheduled gate invocation helper should require explicit attempt identity');
assert.equal(gateRunnerSource.includes(`opts?.stageId || \`gate:\${gate?.type || '${genericMissingValueToken}'}\``), false, 'gate-runner must not synthesize scheduled gate stage ids from gate type fallbacks');
assert.equal(gateRunnerSource.includes('gate run input requires explicit stageId'), true, 'gate-runner should reject missing scheduled gate stage ids at input construction');
assert.equal(gateRunnerSource.includes('gate plugin invocation requires explicit stageId'), true, 'gate-runner should reject missing scheduled gate stage ids at plugin invocation construction');
assert.equal(gateRunnerSource.includes('diagnostics: { gate_status:'), false, 'gate state snapshots must not expose diagnostic gate-status evidence');
assert.equal(gateRunnerSource.includes("priorResults: artifacts.filter((artifact) => artifact.type === 'gate_output')"), true, 'gate priorResults should only expose canonical gate output evidence');
for (const forbiddenGateStatusAuthorityField of ['gate_status_exists:', 'gate_status_is_pass:', 'gate_status_continued:', 'gate_status_timeout_policy:', "artifact.type === 'gate_output' || artifact.type === 'gate_status'"]) assert.equal(gateRunnerSource.includes(forbiddenGateStatusAuthorityField), false, `gate state snapshots must not expose diagnostic gate-status as authority: ${forbiddenGateStatusAuthorityField}`);
assert.equal(waitableGateEngineSource.includes("from './scheduled-gate-invocation.ts'"), true, 'waitable gates should use the shared scheduled gate invocation helper');
assert.equal(remediableGateEngineSource.includes("from './scheduled-gate-invocation.ts'"), true, 'remediable gates should use the shared scheduled gate invocation helper');
assert.equal(waitableGateEngineSource.includes("from '../core/context.ts'"), false, 'waitable gate engine must not keep a private plugin context/envelope path');
assert.equal(remediableGateEngineSource.includes("from '../core/context.ts'"), false, 'remediable gate engine must not keep a private plugin context/envelope path');
assert.equal(waitableGateEngineSource.includes('gateStageStarted'), false, 'waitable gate engine must not use mutable error flags for stage-start evidence');
assert.equal(gateRunnerSource.includes('error?.gateStageStarted'), false, 'gate-runner must consume typed waitable stage-start evidence instead of mutable error flags');
assert.equal(reviewRunnerSource.includes('createReviewGateRemediationController'), false, 'review gate should not keep remediation controller factories');
assert.equal(busterRunnerSource.includes('createBusterGateRemediationController'), true, 'Buster gate should keep typed remediation controller factory');
assert.equal(approvalRunnerSource.includes('createApprovalGateWaitController'), true, 'approval gate should keep typed wait controller factory');
assert.equal(reviewControlSource.includes('non-pass result requires explicit failure_class'), true, 'review gate controls should require typed failure_class for non-pass results');
assert.equal(reviewControlSource.includes("result?.outcome_class === 'passed'"), true, 'review gate pass detection should use the typed outcome class');
assert.equal(reviewControlSource.includes('result?.passed === true'), false, 'review gate controls must not accept legacy passed booleans');
assert.equal(reviewControlSource.includes("String(result?.status || '').trim().toUpperCase() === 'PASS'"), false, 'review gate controls must not accept status pass aliases');
assert.equal(reviewRunnerSource.includes('passed: true'), false, 'review gate pass producers must not emit legacy passed booleans');
assert.equal(reviewRunnerSource.includes('status: STATUS.PASS'), false, 'review gate pass producers must not emit status pass aliases');
assert.equal(reviewControlSource.includes('REVIEW_GATE_FAILURE_DECISIONS'), true, 'review failure classes should map through an explicit decision authority');
assert.equal(reviewControlSource.includes('REVIEW_GATE_FAILURE_FINDINGS'), true, 'review failure classes should map through an explicit finding authority');
assert.equal(reviewControlSource.includes(`return { nextAction: GATE_CONTROL_ACTIONS.BLOCK, issueType: '${genericMissingValueToken}', outcomeClass: 'error' };`), false, 'review failure-class mapping must not fall through to a generic block decision');
assert.equal(busterControlSource.includes('non-pass result requires explicit failure_class'), true, 'Buster gate controls should require typed failure_class for non-pass results');
assert.equal(approvalControlSource.includes("function isApprovalGatePassResult(result = {}) {\n  return result?.outcome_class === 'passed';\n}"), true, 'approval gate pass detection should use the typed outcome class');
assert.equal(approvalControlSource.includes('result?.passed === true'), false, 'approval gate controls must not accept legacy passed booleans');
assert.equal(approvalRunnerSource.includes('passed: true'), false, 'approval gate pass producers must not emit legacy passed booleans');
assert.equal(approvalControlSource.includes('passed outcome requires APPROVED status or continued TIMED_OUT authority'), true, 'approval pass controls should validate domain status authority');
assert.equal(busterControlSource.includes('function inferBusterFailureClass'), false, 'Buster gate controls must not infer failure class from reason/status text');
assert.equal(busterControlSource.includes('reasonLower'), false, 'Buster gate controls must not inspect reason text to classify failures');
assert.equal(reviewControlSource.includes('rate_limit_status?.attempt'), false, 'review gate controls must not derive attempts from rate-limit diagnostics');
assert.equal(busterControlSource.includes('rate_limit_status?.attempt'), false, 'Buster gate controls must not derive attempts from rate-limit diagnostics');
assert.equal(reviewControlSource.includes('rate_limit_exhausted:'), false, 'review gate diagnostic metadata must not own rate-limit exhausted authority');
assert.equal(reviewControlSource.includes('rate_limit:'), false, 'review gate diagnostic metadata must not own rate-limit detail authority');
assert.equal(busterControlSource.includes('rate_limit:'), false, 'Buster gate diagnostic metadata must not own rate-limit detail authority');
assert.equal(busterControlSource.includes('data._verdict'), false, 'Buster gate issue extraction must not read legacy _verdict aliases');
assert.equal(reviewControlSource.includes('resolveResultGatewayLabel'), false, 'review remediation controls must require explicit correlation');
assert.equal(busterControlSource.includes('resolveStatusDispatchId'), false, 'Buster remediation controls must require explicit correlation');
assert.equal(builtinsRegistrySource.includes('gateControl: getReviewGateControlAdapter()'), true, 'review gate strategy must be declared through its gate-control adapter');
assert.equal(builtinsRegistrySource.includes('gateControl: getBusterGateControlAdapter()'), true, 'Buster gate strategy must be declared through its gate-control adapter');
assert.equal(builtinsRegistrySource.includes('gateControl: getApprovalGateControlAdapter()'), true, 'approval gate strategy must be declared through its gate-control adapter');
assert.equal(reviewRunnerSource.includes('allowedNextActions: [GATE_CONTROL_ACTIONS.PASS, GATE_CONTROL_ACTIONS.BLOCK]'), true, 'review standard gate adapter must declare explicit allowed control actions');
assert.equal(gateRunnerSource.includes('must declare gateControl.allowedNextActions'), true, 'generic gate runner must reject non-remediable adapters without allowed actions');

const helperMod = await import(pathToFileURL(helperPath).href);
const reviewControlMod = await import(pathToFileURL(reviewControlPath).href);
const busterControlMod = await import(pathToFileURL(busterControlPath).href);
const busterTerminalMod = await import(pathToFileURL(busterTerminalPath).href);
const approvalControlMod = await import(pathToFileURL(approvalControlPath).href);

assert.equal(typeof helperMod.mapGateCompatibilityResultToControl, 'undefined', 'shared gate helper must not expose compatibility-to-control mapping');
assert.equal(typeof helperMod.projectTypedGateCompatibilityResult, 'undefined', 'shared gate helper must not expose typed-to-compatibility projection');
assert.equal(helperSource.includes('PASS_GATE_STATUSES'), false, 'gateRunStatus validation must not keep pass alias sets');
assert.equal(helperSource.includes('FAIL_GATE_STATUSES'), false, 'gateRunStatus validation must not keep fail alias sets');
assert.equal(helperSource.includes('WAIT_GATE_STATUSES'), false, 'gateRunStatus validation must not keep wait alias sets');

const reviewRateLimited = reviewControlMod.buildReviewGateControlResult(
  { _runId: 'run-1' },
  'review',
  { type: 'review' },
  {
    outcome_class: 'rate_limited',
    reason: 'rate limited',
    rate_limit_exhausted: true,
    failure_class: 'rate_limit_exhausted',
    max_rate_limit_pauses: 2,
    rate_limit_status: { session_key: 'review-session' },
  },
);
assert.equal(reviewRateLimited.nextAction, 'block');
assert.equal(reviewRateLimited.issueType, 'environment');
assert.equal(reviewRateLimited.diagnostics.typed.gate.outcomeClass, 'rate_limited');
assert.equal(reviewRateLimited.diagnostics.typed.rateLimit.max_rate_limit_pauses, 2);
assert.equal(reviewRateLimited.diagnostics.typed.rateLimit.rate_limit_status.session_key, 'review-session');
assert.equal(Object.prototype.hasOwnProperty.call(reviewRateLimited.diagnostics.metadata, 'rate_limit'), false);
assert.equal(Object.prototype.hasOwnProperty.call(reviewRateLimited.diagnostics.metadata, 'rate_limit_status'), false);
assert.equal(Object.prototype.hasOwnProperty.call(reviewRateLimited.diagnostics.metadata, 'max_rate_limit_pauses'), false);
assert.throws(
  () => reviewControlMod.buildReviewGateControlResult(
    { _runId: 'run-1' },
    'review',
    { type: 'review' },
    { outcome_class: 'error', reason: 'reason-only review failure' },
  ),
  /non-pass result requires explicit failure_class/,
  'review gate controls must not infer failure class from status/reason',
);
const reviewFailureExpectations = {
  config_invalid: ['contract', 'error', 'REVIEW_GATE_CONFIG_INVALID'],
  invalid_contract: ['contract', 'error', 'REVIEW_GATE_INVALID_CONTRACT'],
  rate_limit_exhausted: ['environment', 'rate_limited', 'REVIEW_GATE_RATE_LIMIT_EXHAUSTED'],
  review_failed: ['environment', 'error', 'REVIEW_GATE_REVIEW_FAILED'],
  classification_missing: ['contract', 'error', 'REVIEW_GATE_CLASSIFICATION_MISSING'],
  verdict_fail: ['code', 'needs_nova', 'REVIEW_GATE_VERDICT_FAIL'],
};
for (const [failureClass, [issueType, outcomeClass, findingCode]] of Object.entries(reviewFailureExpectations)) {
  const control = reviewControlMod.buildReviewGateControlResult(
    { _runId: 'run-1' },
    'review',
    { type: 'review' },
    { outcome_class: outcomeClass, reason: `${failureClass} reason`, failure_class: failureClass },
  );
  assert.equal(control.nextAction, 'block', `${failureClass} should block`);
  assert.equal(control.issueType, issueType, `${failureClass} issueType`);
  assert.equal(control.diagnostics.typed.gate.outcomeClass, outcomeClass, `${failureClass} outcomeClass`);
  assert.equal(control.diagnostics.findings[0].code, findingCode, `${failureClass} finding code`);
}

const busterVerdictFail = busterControlMod.buildBusterGateControlResult(
  { _runId: 'run-1' },
  'buster',
  { type: 'buster' },
  { outcome_class: 'needs_nova', reason: "Gate 'buster' failed: issue", failure_class: 'verdict_fail' },
);
assert.equal(busterVerdictFail.nextAction, 'block');
assert.equal(busterVerdictFail.issueType, 'code');
assert.equal(busterVerdictFail.diagnostics.typed.gate.outcomeClass, 'needs_nova');
assert.equal(
  busterTerminalMod.assertBusterGateEvaluationResult({ ok: false, reason: 'verdict_fail', status: { reason: 'FAIL' } }).type,
  busterTerminalMod.BUSTER_GATE_EVALUATION_RESULT_TYPES.VERDICT_FAIL,
  'Buster gate terminal should classify the canonical verdict_fail reason as verdict_fail',
);
const malformedBusterGatePass = busterTerminalMod.assertBusterGateEvaluationResult({ ok: true });
assert.equal(malformedBusterGatePass.type, busterTerminalMod.BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT);
assert.equal(malformedBusterGatePass.status.invalid_reason, 'invalid_pass_payload');
const unsupportedBusterGateReason = busterTerminalMod.assertBusterGateEvaluationResult({ ok: false, reason: 'new_shape', status: {} });
assert.equal(unsupportedBusterGateReason.type, busterTerminalMod.BUSTER_GATE_EVALUATION_RESULT_TYPES.INVALID_CONTRACT);
assert.equal(unsupportedBusterGateReason.status.invalid_reason, 'unsupported_reason');
assert.throws(
  () => busterControlMod.buildBusterGateControlResult(
    { _runId: 'run-1' },
    'buster',
    { type: 'buster' },
    { outcome_class: 'needs_nova', reason: "Gate 'buster' failed: issue" },
  ),
  /non-pass result requires explicit failure_class/,
  'Buster gate controls must not infer failure class from status/reason',
);

const approvalTimeoutContinue = approvalControlMod.buildApprovalGateControlResult(
  { _runId: 'run-1' },
  'approval',
  { type: 'approval', on_timeout: 'continue' },
  { outcome_class: 'passed', status: 'TIMED_OUT', continued: true, timed_out: true },
  { approvalState: { timeout_policy: 'CONTINUE' } },
);
assert.equal(approvalTimeoutContinue.nextAction, 'pass');
assert.equal(approvalTimeoutContinue.issueType, 'policy');
assert.equal(approvalTimeoutContinue.diagnostics.typed.gate.outcomeClass, 'passed');
assert.throws(
  () => approvalControlMod.buildApprovalGateControlResult(
    { _runId: 'run-1' },
    'approval',
    { type: 'approval', on_timeout: 'continue' },
    { outcome_class: 'passed', status: 'TIMED_OUT', continued: true, timed_out: true },
  ),
  /persisted state requires timeout_policy authority/,
  'approval control results must read timeout policy from persisted state authority, not gate config fallback',
);
assert.throws(
  () => approvalControlMod.buildApprovalGateControlResult(
    { _runId: 'run-1' },
    'approval',
    { type: 'approval' },
    { outcome_class: 'passed', status: 'REJECTED' },
    { approvalState: { timeout_policy: 'BLOCK' } },
  ),
  /passed outcome requires APPROVED status or continued TIMED_OUT authority/,
  'approval pass controls must fail closed when typed pass conflicts with domain status',
);

const typed = helperMod.buildTypedGateControlResult({
  producerType: 'review',
  nextAction: 'pass',
  summary: 'ok',
  gateRunStatus: 'PASS',
  outcomeClass: 'passed',
});
assert.deepEqual(helperMod.validateTypedGateControlResult(typed, {
  producerType: 'review',
  allowedNextActions: ['pass', 'block'],
}), []);
assert.deepEqual(helperMod.validateTypedGateControlResult(typed, {
  producerType: 'review',
  allowedNextActions: [],
  stageId: 'gate:review',
}), ['allowedNextActions must be non-empty for gate:review']);

for (const aliasStatus of ['OK', 'APPROVED', 'REJECTED', 'CANCELLED', 'PENDING_APPROVAL']) {
  const aliasTyped = helperMod.buildTypedGateControlResult({
    producerType: 'review',
    nextAction: aliasStatus === 'PENDING_APPROVAL' ? 'wait' : 'block',
    summary: 'alias status',
    gateRunStatus: aliasStatus,
    outcomeClass: aliasStatus === 'PENDING_APPROVAL' ? 'waiting' : 'needs_nova',
    wait: aliasStatus === 'PENDING_APPROVAL'
      ? { schemaVersion: 'v1', waitKind: 'approval', status: 'PENDING_APPROVAL' }
      : null,
  });
  const errors = helperMod.validateTypedGateControlResult(aliasTyped, {
    producerType: 'review',
    allowedNextActions: ['pass', 'block', 'wait'],
  });
  assert(errors.some((error) => error.includes('gateRunStatus must be PASS, FAIL, WAIT, or TIMED_OUT')), `${aliasStatus} must not be accepted as gateRunStatus`);
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'typed-gate-controls-only' }));
