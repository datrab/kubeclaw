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
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner.js');
const sharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-shared.js');
const schedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.js');
const recoveryPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-recovery.js');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const schedulingSource = fs.readFileSync(schedulingPath, 'utf8');
const recoverySource = fs.readFileSync(recoveryPath, 'utf8');

for (const marker of [
  "from './pipeline-runner-shared.js'",
  "from './pipeline-runner-scheduling.js'",
  "from './pipeline-runner-recovery.js'",
  "export { PIPELINE_RUN_CONCURRENCY_LIMIT, acquirePipelineRunLock, releasePipelineRunLock } from './pipeline-runner-recovery.js';",
  'return runScheduledGeneratorImpl(config, progress, stageId, opts, getDeps(config));',
  'return findNextStepImpl(config, progress, getDeps(config));',
]) {
  assert.equal(mainSource.includes(marker), true, `pipeline-runner should include ${marker}`);
}

for (const marker of [
  'export function buildPipelineDiscordFields(',
  'export function buildEscalationPayload(',
  'export function buildPipelineHaltPayload(',
  'export function loadAuthoritativeModuleState(',
  'export function buildBlockedModuleResult(',
  'export function buildResultWithStepCorrelation(',
  'export function projectPipelineGateState(',
]) {
  assert.equal(sharedSource.includes(marker), true, `pipeline-runner shared helper must export ${marker}`);
}

for (const marker of [
  'export function validateGeneratorExecutionResult(',
  'export async function runScheduledValidator(',
  'export async function runScheduledGenerator(',
  'export function findNextStep(',
  'export async function preparePipeline(',
]) {
  assert.equal(schedulingSource.includes(marker), true, `pipeline-runner scheduling helper must export ${marker}`);
}

for (const marker of [
  'export const PIPELINE_RUN_CONCURRENCY_LIMIT = 1;',
  'export function acquirePipelineRunLock(',
  'export function releasePipelineRunLock(',
  'export async function reconcileStaleModuleState(',
  'export async function reconcileStaleGateSessions(',
]) {
  assert.equal(recoverySource.includes(marker), true, `pipeline-runner recovery helper must export ${marker}`);
}

for (const disallowed of [
  'function buildGeneratorArtifactRefs(',
  'function buildGeneratorStateSnapshot(',
  'async function runScheduledValidator(',
  'function pipelineRunLockPath(',
  'async function reconcileStaleModuleState(',
  'async function reconcileStaleGateSessions(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `pipeline-runner main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const sharedMod = await import(pathToFileURL(sharedPath).href);
const schedulingMod = await import(pathToFileURL(schedulingPath).href);
const recoveryMod = await import(pathToFileURL(recoveryPath).href);

for (const [mod, name] of [
  [mainMod, 'runPipeline'],
  [mainMod, 'runScheduledGenerator'],
  [mainMod, 'findNextStep'],
  [mainMod, 'validateGeneratorExecutionResult'],
  [mainMod, 'acquirePipelineRunLock'],
  [mainMod, 'releasePipelineRunLock'],
  [sharedMod, 'buildPipelineDiscordFields'],
  [sharedMod, 'buildBlockedModuleResult'],
  [sharedMod, 'buildResultWithStepCorrelation'],
  [sharedMod, 'projectPipelineGateState'],
  [schedulingMod, 'runScheduledValidator'],
  [schedulingMod, 'runScheduledGenerator'],
  [schedulingMod, 'findNextStep'],
  [schedulingMod, 'preparePipeline'],
  [recoveryMod, 'acquirePipelineRunLock'],
  [recoveryMod, 'releasePipelineRunLock'],
  [recoveryMod, 'reconcileStaleModuleState'],
  [recoveryMod, 'reconcileStaleGateSessions'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

assert.equal(mainMod.PIPELINE_RUN_CONCURRENCY_LIMIT, 1, 'pipeline-runner main module should preserve the run concurrency limit export');
assert.equal(recoveryMod.PIPELINE_RUN_CONCURRENCY_LIMIT, 1, 'pipeline-runner recovery helper should own the run concurrency limit export');

console.log(JSON.stringify({ ok: true, checked: 25 }));
