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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-control-result.js');
const reviewPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.js');
const busterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js');
const approvalPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/approval-gate-runner.js');
const gateRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const busterSource = fs.readFileSync(busterPath, 'utf8');
const approvalSource = fs.readFileSync(approvalPath, 'utf8');
const gateRunnerSource = fs.readFileSync(gateRunnerPath, 'utf8');

for (const marker of [
  'export function cloneSerializable(',
  'export function buildTypedGateControlResult(',
  'export function isTypedGateControlResult(',
  'export function coerceTypedGateControlResult(',
  'export function extractTypedGateLegacyResult(',
  'export function validateTypedGateControlResult(',
  'export function normalizeTypedGateControlResult(',
  'export function validateRemediableTypedGateControlResult(',
  'export function normalizeRemediableTypedGateControlResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `shared gate control-result helper must export ${marker}`);
}

for (const [name, source] of [['review', reviewSource], ['buster', busterSource], ['approval', approvalSource]]) {
  assert.equal(source.includes("from '../services/gate-control-result.js'"), true, `${name} gate runner should import the shared gate control-result helper`);
  assert.equal(source.includes('function cloneSerializable('), false, `${name} gate runner must not keep a local cloneSerializable helper`);
  assert.equal(source.includes('buildTypedGateControlResult({'), true, `${name} gate runner should build control results through the shared helper`);
  assert.equal(source.includes('coerceTypedGateControlResult('), true, `${name} gate runner should coerce control results through the shared helper`);
  assert.equal(source.includes('extractTypedGateLegacyResult('), true, `${name} gate runner should extract legacy results through the shared helper`);
}

assert.equal(gateRunnerSource.includes("from '../services/gate-control-result.js'"), true, 'gate-runner should import the shared gate control-result normalizer');
assert.equal(gateRunnerSource.includes('normalizeRemediableTypedGateControlResult('), true, 'gate-runner should normalize review/Buster gate control results through the shared helper');
assert.equal(gateRunnerSource.includes('normalizeTypedGateControlResult('), true, 'gate-runner should normalize approval gate control results through the shared helper');
assert.equal(gateRunnerSource.includes('function validateReviewGateControlResult('), false, 'gate-runner must not keep a local review gate control-result validator');
assert.equal(gateRunnerSource.includes('function validateBusterGateControlResult('), false, 'gate-runner must not keep a local Buster gate control-result validator');
assert.equal(gateRunnerSource.includes('function validateApprovalGateControlResult('), false, 'gate-runner must not keep a local approval gate control-result validator');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.cloneSerializable, 'function', 'shared gate control-result helper should expose cloneSerializable');
assert.equal(typeof helperMod.buildTypedGateControlResult, 'function', 'shared gate control-result helper should expose buildTypedGateControlResult');
assert.equal(typeof helperMod.isTypedGateControlResult, 'function', 'shared gate control-result helper should expose isTypedGateControlResult');
assert.equal(typeof helperMod.coerceTypedGateControlResult, 'function', 'shared gate control-result helper should expose coerceTypedGateControlResult');
assert.equal(typeof helperMod.extractTypedGateLegacyResult, 'function', 'shared gate control-result helper should expose extractTypedGateLegacyResult');
assert.equal(typeof helperMod.validateTypedGateControlResult, 'function', 'shared gate control-result helper should expose validateTypedGateControlResult');
assert.equal(typeof helperMod.normalizeTypedGateControlResult, 'function', 'shared gate control-result helper should expose normalizeTypedGateControlResult');
assert.equal(typeof helperMod.validateRemediableTypedGateControlResult, 'function', 'shared gate control-result helper should expose validateRemediableTypedGateControlResult');
assert.equal(typeof helperMod.normalizeRemediableTypedGateControlResult, 'function', 'shared gate control-result helper should expose normalizeRemediableTypedGateControlResult');

console.log(JSON.stringify({ ok: true, checked: 27 }));
