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
const moduleRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.js');
const sharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.js');
const forgePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge.js');

const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const forgeSource = fs.readFileSync(forgePath, 'utf8');

for (const marker of [
  'export function currentAttemptNumber(',
  'export function buildModuleForgeRunInput(',
  'export function buildModuleBusterRunInput(',
  'export function buildModuleWorkerPluginInvocation(',
  'export function normalizeModuleBusterWorkerResult(',
  'export function emitTerminalModuleFailTelemetry(',
]) {
  assert.equal(sharedSource.includes(marker), true, `module-runner shared helper must export ${marker}`);
}

for (const marker of [
  'export async function runModuleForgePhase(',
  'export async function finalizeForgeOnlyPass(',
  'export async function prepareModuleForBuster(',
]) {
  assert.equal(forgeSource.includes(marker), true, `module-runner forge helper must export ${marker}`);
}

assert.equal(moduleRunnerSource.includes("from './module-runner-shared.js'"), true, 'module-runner should import the shared module-runner helper surface');
assert.equal(moduleRunnerSource.includes("from './module-runner-forge.js'"), true, 'module-runner should import the extracted forge/pre-Buster helper surface');
assert.equal(moduleRunnerSource.includes('await runModuleForgePhase({'), true, 'module-runner should delegate Forge phase execution through the extracted helper');
assert.equal(moduleRunnerSource.includes('await finalizeForgeOnlyPass({'), true, 'module-runner should delegate forge-only pass promotion through the extracted helper');
assert.equal(moduleRunnerSource.includes('await prepareModuleForBuster({'), true, 'module-runner should delegate pre-Buster preparation through the extracted helper');
assert.equal(moduleRunnerSource.includes('function buildModuleForgeRunInput('), false, 'module-runner must not keep a local Forge run-input builder');
assert.equal(moduleRunnerSource.includes('function buildModuleBusterRunInput('), false, 'module-runner must not keep a local Buster run-input builder');
assert.equal(moduleRunnerSource.includes('function normalizeModuleForgeWorkerResult('), false, 'module-runner must not keep a local Forge worker-result normalizer');
assert.equal(moduleRunnerSource.includes('function normalizeModuleBusterWorkerResult('), false, 'module-runner must not keep a local Buster worker-result normalizer');

const sharedMod = await import(pathToFileURL(sharedPath).href);
const forgeMod = await import(pathToFileURL(forgePath).href);
assert.equal(typeof sharedMod.currentAttemptNumber, 'function', 'shared module-runner helper should expose currentAttemptNumber');
assert.equal(typeof sharedMod.buildModuleForgeRunInput, 'function', 'shared module-runner helper should expose buildModuleForgeRunInput');
assert.equal(typeof sharedMod.buildModuleBusterRunInput, 'function', 'shared module-runner helper should expose buildModuleBusterRunInput');
assert.equal(typeof sharedMod.buildModuleWorkerPluginInvocation, 'function', 'shared module-runner helper should expose buildModuleWorkerPluginInvocation');
assert.equal(typeof sharedMod.normalizeModuleBusterWorkerResult, 'function', 'shared module-runner helper should expose normalizeModuleBusterWorkerResult');
assert.equal(typeof forgeMod.runModuleForgePhase, 'function', 'forge helper should expose runModuleForgePhase');
assert.equal(typeof forgeMod.finalizeForgeOnlyPass, 'function', 'forge helper should expose finalizeForgeOnlyPass');
assert.equal(typeof forgeMod.prepareModuleForBuster, 'function', 'forge helper should expose prepareModuleForBuster');

console.log(JSON.stringify({ ok: true, checked: 17 }));
