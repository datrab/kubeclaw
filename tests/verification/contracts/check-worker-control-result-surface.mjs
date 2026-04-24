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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/worker-control-result.js');
const orchestrationPath = path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.js');
const moduleRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.js');
const moduleRunnerSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const orchestrationSource = fs.readFileSync(orchestrationPath, 'utf8');
const moduleRunnerSource = fs.readFileSync(moduleRunnerPath, 'utf8');
const moduleRunnerSharedSource = fs.readFileSync(moduleRunnerSharedPath, 'utf8');

for (const marker of [
  'export function cloneSerializable(',
  'export function buildTypedWorkerControlResult(',
  'export function isTypedWorkerControlResult(',
  'export function coerceTypedWorkerControlResult(',
  'export function extractTypedWorkerLegacyResult(',
  'export function validateTypedWorkerControlResult(',
  'export function normalizeTypedWorkerControlResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `shared worker control-result helper must export ${marker}`);
}

assert.equal(orchestrationSource.includes("from '../services/worker-control-result.js'"), true, 'orchestration should import the shared worker control-result helper');
assert.equal(orchestrationSource.includes('function cloneSerializable('), false, 'orchestration must not keep a local cloneSerializable helper for worker control results');
assert.equal(orchestrationSource.includes('buildTypedWorkerControlResult({'), true, 'orchestration should build worker control results through the shared helper');
assert.equal(orchestrationSource.includes('coerceTypedWorkerControlResult('), true, 'orchestration should coerce worker control results through the shared helper');
assert.equal(orchestrationSource.includes('extractTypedWorkerLegacyResult('), true, 'orchestration should extract worker legacy results through the shared helper');
assert.equal(orchestrationSource.includes('isTypedWorkerControlResult('), true, 'orchestration should test worker control-result shape through the shared helper');

assert.equal(moduleRunnerSharedSource.includes("from '../services/worker-control-result.js'"), true, 'module-runner shared helper should import the shared worker control-result validator');
assert.equal(moduleRunnerSharedSource.includes('normalizeTypedWorkerControlResult('), true, 'module-runner shared helper should normalize worker control results through the shared helper');
assert.equal(moduleRunnerSource.includes('normalizeTypedWorkerControlResult('), false, 'module-runner should not keep direct worker control-result normalization after the slice');
assert.equal(moduleRunnerSource.includes('function validateModuleForgeWorkerControlResult('), false, 'module-runner must not keep a local Forge worker control-result validator');
assert.equal(moduleRunnerSource.includes('function validateModuleBusterWorkerControlResult('), false, 'module-runner must not keep a local Buster worker control-result validator');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.cloneSerializable, 'function', 'shared worker control-result helper should expose cloneSerializable');
assert.equal(typeof helperMod.buildTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose buildTypedWorkerControlResult');
assert.equal(typeof helperMod.isTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose isTypedWorkerControlResult');
assert.equal(typeof helperMod.coerceTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose coerceTypedWorkerControlResult');
assert.equal(typeof helperMod.extractTypedWorkerLegacyResult, 'function', 'shared worker control-result helper should expose extractTypedWorkerLegacyResult');
assert.equal(typeof helperMod.validateTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose validateTypedWorkerControlResult');
assert.equal(typeof helperMod.normalizeTypedWorkerControlResult, 'function', 'shared worker control-result helper should expose normalizeTypedWorkerControlResult');

console.log(JSON.stringify({ ok: true, checked: 18 }));
