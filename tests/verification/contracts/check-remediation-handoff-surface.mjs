import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-remediation-handoff-surface' });
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

const gateRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.ts'), 'utf8');
const reviewGateSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts'), 'utf8');
const reviewGateControlSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-control.ts'), 'utf8');
const busterGateSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts'), 'utf8');
const busterGateControlSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-control.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/remediable-gate-engine.ts'), 'utf8');
const waitableEngineSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/waitable-gate-engine.ts'), 'utf8');
const approvalGateSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/approval-gate-runner.ts'), 'utf8');
const remediationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/remediation-handoff.ts'), 'utf8');
const registrySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts'), 'utf8');

assert.equal(gateRunnerSource.includes("from './remediable-gate-engine.ts'"), true, 'gate-runner should import the shared remediable gate engine');
assert.equal(gateRunnerSource.includes('runScheduledRemediableGate({'), true, 'gate-runner should delegate Buster remediation loops through the shared remediable gate engine');
assert.equal(gateRunnerSource.includes('runGateRemediationHandoff({'), false, 'gate-runner should not keep a local remediation handoff loop after slice 5');
assert.equal(reviewGateSource.includes("from './remediable-gate-engine.ts'"), false, 'review gate runner must not import the remediable scheduler directly');
assert.equal(reviewGateSource.includes('runRemediableGateControlLoop({'), false, 'review gate runner must not keep a direct remediation loop');
assert.equal(busterGateSource.includes("from './remediable-gate-engine.ts'"), false, 'buster gate runner must not import the remediable scheduler directly');
assert.equal(busterGateSource.includes('runRemediableGateControlLoop({'), false, 'buster gate runner must not keep a direct remediation loop');
assert.equal(reviewGateSource.includes('export async function runReviewGate('), false, 'review gate direct runtime wrapper must be deleted');
assert.equal(busterGateSource.includes('export async function runBusterGate('), false, 'Buster gate direct runtime wrapper must be deleted');
assert.equal(approvalGateSource.includes('export async function runApprovalGate('), false, 'approval gate direct runtime wrapper must be deleted');
assert.equal(approvalGateSource.includes('export default runApprovalGate'), false, 'approval gate default direct wrapper export must be deleted');
assert.equal(reviewGateSource.includes("from './review-gate-control.ts'"), true, 'review gate runner should delegate typed-control construction to the extracted control helper');
assert.equal(busterGateSource.includes("from './buster-gate-control.ts'"), true, 'buster gate runner should delegate typed-control construction to the extracted control helper');
assert.equal(reviewGateControlSource.includes('buildGateRemediationRequestControlResult'), false, 'review gate control helper should not emit remediation request contracts');
assert.equal(busterGateControlSource.includes('buildGateRemediationRequestControlResult'), true, 'buster gate control helper should emit the shared remediation request contract');
assert.equal(reviewGateSource.includes('export function createReviewGateRemediationController('), false, 'review gate runner should not expose remediation controllers');
assert.equal(busterGateSource.includes('export function createBusterGateRemediationController('), true, 'buster gate runner should expose a standard remediation controller factory');
assert.equal(reviewGateSource.includes('export function getReviewGateControlAdapter('), true, 'review gate runner should export its gate control adapter factory');
assert.equal(busterGateSource.includes('export function getBusterGateControlAdapter('), true, 'buster gate runner should export its gate control adapter factory');
assert.equal(registrySource.includes('buildRemediationHandlers:'), false, 'registry should not construct gate-specific remediation callback bundles');
assert.equal(registrySource.includes('runReviewGateFixAttempt'), false, 'registry should not import review-specific fix loop functions');
assert.equal(registrySource.includes('runBusterGateFixAttempt'), false, 'registry should not import Buster-specific fix loop functions');
assert.equal(engineSource.includes('export async function runRemediableGateControlLoop('), false, 'shared remediable gate engine must not export compatibility loop wrappers');
assert.equal(waitableEngineSource.includes('export async function runWaitableGateControlLoop('), false, 'shared waitable gate engine must not export compatibility loop wrappers');
assert.equal(engineSource.includes('export async function runScheduledRemediableGate('), true, 'shared remediable gate engine should export runScheduledRemediableGate');
assert.equal(engineSource.includes('while (isGateRemediationControlResult(controlResult))'), true, 'shared scheduled remediable gate engine should own request_fix branching');
assert.equal(remediationSource.includes('export async function runGateRemediationHandoff('), false, 'remediation service must not expose compatibility loop wrappers');
assert.equal(engineSource.includes('createRemediationController'), true, 'shared remediable gate engine should consume standard remediation controller factories');
assert.equal(engineSource.includes('buildExhaustedControlResult'), true, 'shared remediable gate engine should consume typed exhausted control results');
assert.equal(engineSource.includes('buildExhaustedCompatibilityResult'), false, 'shared remediable gate engine must not consume exhausted compatibility results');
assert.equal(engineSource.includes('fixOutcome.controlResult'), true, 'shared remediable gate engine should require terminal fix outcomes to return typed control results');
assert.equal(engineSource.includes("fixOutcome?.mode === 're_evaluate'"), true, 'shared remediable gate engine should require explicit re_evaluate fix outcome mode before re-running the gate');
assert.equal(engineSource.includes('remediation outcome must use typed mode terminal, retry_request_fix, or re_evaluate'), true, 'shared remediable gate engine should reject legacy control-result-only fix outcomes');
assert.equal(engineSource.includes('fixOutcomeDegraded:'), true, 'shared remediable gate engine should pass typed degraded fix outcome state to re-evaluation');
assert.equal(remediationSource.includes("nextAction: 'request_fix'") && remediationSource.includes('validateGateRemediationControlResult'), true, 'shared remediation service should define and validate the request_fix control contract');
assert.equal(remediationSource.includes('validateGateRemediationController'), true, 'shared remediation service should validate remediation controller shape');
assert.equal(remediationSource.includes('buildExhaustedControlResult'), true, 'shared remediation service should require typed exhausted control results');
assert.equal(remediationSource.includes('buildExhaustedCompatibilityResult'), false, 'shared remediation service must not require exhausted compatibility results');
assert.equal(reviewGateSource.includes('buildReviewRemediationExhaustedControlResult'), false, 'review gate runner should not build remediation exhausted control results');
assert.equal(reviewGateSource.includes('buildReviewRemediationExhaustedCompatibilityResult'), false, 'review gate runner must not build exhausted remediation compatibility results');
assert.equal(busterGateSource.includes('buildBusterRemediationExhaustedControlResult'), true, 'Buster gate runner should build typed exhausted remediation control results');
assert.equal(busterGateSource.includes('buildBusterRemediationExhaustedCompatibilityResult'), false, 'Buster gate runner must not build exhausted remediation compatibility results');

const remediationMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/services/remediation-handoff.ts')).href);
const engineMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/remediable-gate-engine.ts')).href);
const gateRunnerMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.ts')).href);
const reviewGateMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts')).href);
const busterGateMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts')).href);
const approvalGateMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/approval-gate-runner.ts')).href);

const remediationControlResult = remediationMod.buildGateRemediationRequestControlResult({
  producerType: 'buster',
  gateId: 'gate:buster',
  gateType: 'buster',
  runId: 'run-remediation-contract-1',
  attempt: 1,
  summary: 'Need a fix',
  findings: [{ code: 'ISSUE_1', severity: 'error', message: 'Fix me' }],
  remediation: {
    policy: {
      maxFixCycles: 2,
      nextFixCycle: 1,
    rerunStageId: 'gate:buster',
    },
    targetRef: 'gate:gate:buster',
    startedAt: '2026-05-25T00:00:00.000Z',
  },
});

assert.equal(remediationControlResult.nextAction, 'request_fix');
assert.deepEqual(remediationMod.validateGateRemediationControlResult(remediationControlResult, 'gate:review'), []);
assert.equal(typeof gateRunnerMod.runGate, 'function', 'gate runner should export runGate');
assert.equal(Object.prototype.hasOwnProperty.call(engineMod, 'runRemediableGateControlLoop'), false, 'shared remediable gate engine should not export compatibility loop wrappers');
assert.equal(typeof engineMod.runScheduledRemediableGate, 'function', 'shared remediable gate engine should export runScheduledRemediableGate');
assert.equal(Object.prototype.hasOwnProperty.call(reviewGateMod, 'runReviewGate'), false, 'review gate runner should not export direct runtime wrappers');
assert.equal(Object.prototype.hasOwnProperty.call(busterGateMod, 'runBusterGate'), false, 'Buster gate runner should not export direct runtime wrappers');
assert.equal(Object.prototype.hasOwnProperty.call(approvalGateMod, 'runApprovalGate'), false, 'approval gate runner should not export direct runtime wrappers');
assert.equal(typeof reviewGateMod.runReviewGateEvaluation, 'function', 'review gate runner should export runReviewGateEvaluation');
assert.equal(Object.prototype.hasOwnProperty.call(reviewGateMod, 'runReviewGateFixAttempt'), false, 'review gate runner should not export review fix attempts');
assert.equal(Object.prototype.hasOwnProperty.call(reviewGateMod, 'createReviewGateRemediationController'), false, 'review gate runner should not export review remediation controllers');
assert.equal(reviewGateMod.getReviewGateControlAdapter().mode, 'standard', 'review gate control adapter should be standard');
assert.equal(Object.prototype.hasOwnProperty.call(reviewGateMod.getReviewGateControlAdapter(), 'createRemediationController'), false, 'review gate control adapter should not expose remediation controllers');
assert.equal(typeof busterGateMod.runBusterGateEvaluation, 'function', 'buster gate runner should export runBusterGateEvaluation');
assert.equal(typeof busterGateMod.runBusterGateFixAttempt, 'function', 'buster gate runner should export runBusterGateFixAttempt');
assert.equal(typeof busterGateMod.createBusterGateRemediationController, 'function', 'buster gate runner should export createBusterGateRemediationController');
assert.equal(typeof busterGateMod.getBusterGateControlAdapter().createRemediationController, 'function', 'buster gate control adapter should expose createRemediationController');

await assert.rejects(
  () => engineMod.runRemediableGateControlLoopResult({
    initialControlResult: remediationControlResult,
    remediationController: {
      evaluateGate: async () => remediationControlResult,
      performFix: async () => ({ controlResult: remediationControlResult }),
      projectCompatibilityResult: (controlResult) => ({ gate: controlResult?.gateId || 'review' }),
      buildExhaustedControlResult: async () => remediationControlResult,
    },
    normalizeControlResult: (value) => value,
    gateId: 'review',
    gate: { type: 'review' },
  }),
  /remediation outcome must use typed mode terminal, retry_request_fix, or re_evaluate/,
  'legacy control-result-only remediation outcomes must fail until adapters return the typed fix outcome union',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 56 }));
