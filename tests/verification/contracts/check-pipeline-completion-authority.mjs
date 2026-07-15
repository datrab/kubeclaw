import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function read(sourceRoot, relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

function exists(sourceRoot, relativePath) {
  return fs.existsSync(path.join(sourceRoot, relativePath));
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const exportStart = source.indexOf(`export function ${name}(`);
  const resolvedStart = exportStart >= 0 ? exportStart : start;
  assert.notEqual(resolvedStart, -1, `expected function ${name}`);
  const bodyStart = source.indexOf('{', resolvedStart);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(resolvedStart, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const { sourceRoot } = parseArgs();

const plan = read(sourceRoot, 'docs/pipeline/completion-authority-plan.md');
const completion = read(sourceRoot, 'skills/common/pipeline/completion.ts');
const statusStore = read(sourceRoot, 'skills/nova/pipeline/services/status-store.ts');
const lifecycle = read(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle.ts');
const appenders = read(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle/appenders.ts');
const projections = read(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle/projections.ts');
const idempotency = read(sourceRoot, 'skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts');
const identity = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/identity.ts');
const pollFailure = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts');
const busterPhase = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase.ts');
const terminalFailure = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-failure.ts');
const forge = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge.ts');
const forgeCompletions = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/forge-completions.ts');
const runnerCompletions = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/completions.ts');
const gateRunner = read(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.ts');
const reviewGateRunner = read(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts');
const preBuster = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner-prebuster.ts');
const retryPolicy = read(sourceRoot, 'skills/nova/pipeline/services/failures/retry-policy.ts');
const attempt = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner/attempt.ts');
const packageJson = JSON.parse(read(sourceRoot, 'package.json'));

for (const marker of [
  'runner evidence -> Completion -> lifecycle reducer -> lifecycle event spine -> read models -> sinks/plugins/reports',
  '`session_key` is observation/control metadata',
  'Terminal module and gate state must not be persisted by scattered',
  'applyModuleCompletion',
]) {
  assert.equal(plan.includes(marker), true, `completion authority plan must document: ${marker}`);
}

for (const marker of [
  'export function assertCompletion(',
  'export function isTerminalCompletionStatus(',
  'COMPLETION_STATUS_VALUES',
  'COMPLETION_AUTHORITY_KIND_VALUES',
]) {
  assert.equal(completion.includes(marker), true, `shared completion contract must export ${marker}`);
}

assert.equal(statusStore.includes('applyModuleCompletion'), true, 'status-store facade must export applyModuleCompletion');
assert.equal(statusStore.includes('applyGateCompletion'), true, 'status-store facade must export applyGateCompletion');
assert.equal(lifecycle.includes('export function applyModuleCompletion('), true, 'lifecycle facade must export applyModuleCompletion');
assert.equal(lifecycle.includes('export function applyGateCompletion('), true, 'lifecycle facade must export applyGateCompletion');
assert.equal(appenders.includes('export function applyModuleCompletion('), true, 'lifecycle appenders must own applyModuleCompletion');
assert.equal(appenders.includes('export function applyGateCompletion('), true, 'lifecycle appenders must own applyGateCompletion');
assert.equal(appenders.includes('appendModuleLifecycleEvent(config, dir, status, lifecycleMutation)'), true, 'applyModuleCompletion must append through lifecycle spine');
assert.equal(appenders.includes('appendLifecycleEvent(config, {'), true, 'applyGateCompletion must append through lifecycle spine');
assert.equal(appenders.includes('completion: cloneSerializable(completion)'), true, 'lifecycle events must retain completion evidence');
assert.equal(projections.includes('function applyGateCompletionEventToReadModels('), true, 'lifecycle projections must project gate completions');
assert.equal(projections.includes('gate_evaluation.passed'), true, 'gate PASS completion must be a lifecycle event');
assert.equal(idempotency.includes("case 'gate_evaluation.passed':"), true, 'gate PASS completion must have lifecycle idempotency authority');
assert.equal(idempotency.includes("case 'gate_evaluation.failed':"), true, 'gate FAIL completion must have lifecycle idempotency authority');
assert.equal(idempotency.includes("case 'gate_evaluation.blocked':"), true, 'gate BLOCKED completion must have lifecycle idempotency authority');

const requiredCompletionIdentity = functionSource(pollFailure, 'requiredCompletionIdentity');
assert.equal(requiredCompletionIdentity.includes("requireText(completionIdentity.sessionKey, 'completionIdentity.sessionKey')"), false, 'Buster strong completion identity must not require sessionKey');
assert.equal(requiredCompletionIdentity.includes('sessionKey: selectDefinedValue'), true, 'Buster completion identity should carry optional sessionKey when observed');
const resolveCompletionSessionKeySource = functionSource(identity, 'resolveCompletionSessionKey');
assert.equal(resolveCompletionSessionKeySource.includes("return requireText(completionIdentity.sessionKey, 'completionIdentity.sessionKey')"), false, 'completion session resolver must not require sessionKey for terminal completion');
assert.equal(identity.includes('return textValue(resolveStatusSessionKey(statusValue))'), true, 'expected completion session key should be optional observation');

assert.equal(busterPhase.includes("from '../../lifecycle-state.ts'"), false, 'Buster phase must not own terminal lifecycle transitions directly');
assert.equal(busterPhase.includes('deps.applyModuleCompletion(config, dir, status'), true, 'Buster Redis terminal evidence must apply completion through the lifecycle reducer');

assert.equal(exists(sourceRoot, 'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts'), false, 'stale Buster terminal-pass wrapper must be deleted');
assert.equal(busterPhase.includes('function finalizeBusterPassCompletion('), true, 'Buster PASS must finalize at the phase boundary');
assert.equal(busterPhase.includes('deps.applyModuleCompletion(config, dir, status'), true, 'Buster PASS must persist through applyModuleCompletion');

assert.equal(forge.includes("from './module-runner/forge-completions.ts'"), true, 'Forge runner must delegate completion application to a focused helper');
assert.equal(forgeCompletions.includes('deps.applyModuleCompletion(config, dir, status'), true, 'Forge completion helper must use applyModuleCompletion');
assert.equal(runnerCompletions.includes('throw new Error(\'applyModuleRunnerCompletion requires completion authority\')'), true, 'runner completion helper must require explicit authority');
assert.equal(gateRunner.includes('applyGateCompletion(config, gateId, gate'), true, 'generic gate runner must apply accepted terminal gate controls through applyGateCompletion');
assert.equal(gateRunner.includes('function applyAcceptedGateControl('), true, 'generic gate runner must own accepted gate control application');
assert.equal(reviewGateRunner.includes('onGatePass'), false, 'review gate runner must not directly emit PASS sink events');
assert.equal(reviewGateRunner.includes('onGateFail'), false, 'review gate runner must not directly emit FAIL sink events');
assert.equal(reviewGateRunner.includes('getGateStats(config).gates_completed.push'), false, 'review gate runner must not mutate gate completion stats directly');

const migratedTerminalSources = {
  'module-runner-forge.ts': forge,
  'module-runner-prebuster.ts': preBuster,
  'buster-phase.ts': busterPhase,
  'buster-phase/poll-failure.ts': pollFailure,
  'buster-phase/terminal-failure.ts': terminalFailure,
  'services/failures/retry-policy.ts': retryPolicy,
};

for (const [label, source] of Object.entries(migratedTerminalSources)) {
  assert.equal(source.includes('markModuleBlocked'), false, `${label} must not bypass completion with markModuleBlocked`);
  assert.equal(/transitionModuleStatus\([^)]*STATUS\.(PASS|FAIL|BLOCKED)/s.test(source), false, `${label} must not persist terminal module status with transitionModuleStatus`);
  assert.equal(source.includes('onModulePass'), false, `${label} must not emit module PASS sink events outside lifecycle completion`);
  assert.equal(source.includes('onPhaseCompleted'), false, `${label} must not emit terminal phase-completed sink events outside lifecycle completion`);
  assert.equal(source.includes('handleBusterPassStatus'), false, `${label} must not reference stale Buster PASS wrapper`);
}

assert.equal(attempt.includes('applyModuleCompletion'), true, 'module attempt deps must expose applyModuleCompletion to phase runners');
assert.equal(packageJson.scripts['verify:contracts'].includes('check-pipeline-completion-authority.mjs'), true, 'root verify:contracts must enforce completion authority');

console.log('pipeline completion authority contract ok');
