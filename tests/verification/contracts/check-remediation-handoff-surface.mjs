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

const gateRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.js'), 'utf8');
const reviewGateSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.js'), 'utf8');
const busterGateSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/remediable-gate-engine.js'), 'utf8');
const remediationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/remediation-handoff.js'), 'utf8');

assert.equal(gateRunnerSource.includes("from './remediable-gate-engine.js'"), true, 'gate-runner should import the shared remediable gate engine');
assert.equal(gateRunnerSource.includes('runScheduledRemediableGate({'), true, 'gate-runner should delegate review/Buster remediation loops through the shared remediable gate engine');
assert.equal(gateRunnerSource.includes('runGateRemediationHandoff({'), false, 'gate-runner should not keep a local remediation handoff loop after slice 5');
assert.equal(reviewGateSource.includes("from './remediable-gate-engine.js'"), true, 'review gate runner should import the shared remediable gate engine');
assert.equal(reviewGateSource.includes('runRemediableGateControlLoop({'), true, 'review gate runner should delegate remediation control looping through the shared remediable gate engine');
assert.equal(busterGateSource.includes("from './remediable-gate-engine.js'"), true, 'buster gate runner should import the shared remediable gate engine');
assert.equal(busterGateSource.includes('runRemediableGateControlLoop({'), true, 'buster gate runner should delegate remediation control looping through the shared remediable gate engine');
assert.equal(reviewGateSource.includes('buildGateRemediationRequestControlResult'), true, 'review gate runner should still emit the shared remediation request contract');
assert.equal(busterGateSource.includes('buildGateRemediationRequestControlResult'), true, 'buster gate runner should still emit the shared remediation request contract');
assert.equal(engineSource.includes('export async function runRemediableGateControlLoop('), true, 'shared remediable gate engine should export runRemediableGateControlLoop');
assert.equal(engineSource.includes('export async function runScheduledRemediableGate('), true, 'shared remediable gate engine should export runScheduledRemediableGate');
assert.equal(engineSource.includes("initialControlResult?.nextAction !== 'request_fix'"), true, 'shared remediable gate engine should own request_fix branching');
assert.equal(engineSource.includes('runGateRemediationHandoff({'), true, 'shared remediable gate engine should hand request_fix loops to the remediation handoff service');
assert.equal(remediationSource.includes("nextAction: 'request_fix'") && remediationSource.includes('validateGateRemediationControlResult'), true, 'shared remediation service should define and validate the request_fix control contract');

const remediationMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/services/remediation-handoff.js')).href);
const engineMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/remediable-gate-engine.js')).href);
const gateRunnerMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.js')).href);
const reviewGateMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.js')).href);
const busterGateMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js')).href);

const remediationControlResult = remediationMod.buildGateRemediationRequestControlResult({
  producerType: 'review',
  gateId: 'gate:review',
  gateType: 'review',
  runId: 'run-remediation-contract-1',
  attempt: 1,
  summary: 'Need a fix',
  findings: [{ code: 'ISSUE_1', severity: 'error', message: 'Fix me' }],
  remediation: {
    policy: {
      maxFixCycles: 2,
      nextFixCycle: 1,
      rerunStageId: 'gate:review',
    },
  },
});

assert.equal(remediationControlResult.nextAction, 'request_fix');
assert.deepEqual(remediationMod.validateGateRemediationControlResult(remediationControlResult, 'gate:review'), []);
assert.equal(typeof gateRunnerMod.runGate, 'function', 'gate runner should export runGate');
assert.equal(typeof engineMod.runRemediableGateControlLoop, 'function', 'shared remediable gate engine should export runRemediableGateControlLoop');
assert.equal(typeof engineMod.runScheduledRemediableGate, 'function', 'shared remediable gate engine should export runScheduledRemediableGate');
assert.equal(typeof reviewGateMod.runReviewGateEvaluation, 'function', 'review gate runner should export runReviewGateEvaluation');
assert.equal(typeof reviewGateMod.runReviewGateFixAttempt, 'function', 'review gate runner should export runReviewGateFixAttempt');
assert.equal(typeof busterGateMod.runBusterGateEvaluation, 'function', 'buster gate runner should export runBusterGateEvaluation');
assert.equal(typeof busterGateMod.runBusterGateFixAttempt, 'function', 'buster gate runner should export runBusterGateFixAttempt');

console.log(JSON.stringify({ ok: true, checked: 21 }));
