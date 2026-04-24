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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-active-session.js');
const reviewPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.js');
const busterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const busterSource = fs.readFileSync(busterPath, 'utf8');

assert.equal(helperSource.includes('export function persistGateActiveSession('), true, 'shared gate active-session helper should export persistGateActiveSession');
assert.equal(helperSource.includes('export function clearGateActiveSession('), true, 'shared gate active-session helper should export clearGateActiveSession');
assert.equal(helperSource.includes('gateActiveSessionPath'), true, 'shared gate active-session helper should own gateActiveSessionPath usage');

assert.equal(reviewSource.includes("from '../services/gate-active-session.js'"), true, 'review gate runner should import the shared gate active-session helper');
assert.equal(busterSource.includes("from '../services/gate-active-session.js'"), true, 'buster gate runner should import the shared gate active-session helper');
assert.equal(reviewSource.includes('function persistGateActiveSession('), false, 'review gate runner must not keep a local persistGateActiveSession helper');
assert.equal(reviewSource.includes('function clearGateActiveSession('), false, 'review gate runner must not keep a local clearGateActiveSession helper');
assert.equal(busterSource.includes('function persistGateActiveSession('), false, 'buster gate runner must not keep a local persistGateActiveSession helper');
assert.equal(busterSource.includes('function clearGateActiveSession('), false, 'buster gate runner must not keep a local clearGateActiveSession helper');
assert.equal(reviewSource.includes('function writeJsonAtomic('), false, 'review gate runner must not keep a local writeJsonAtomic helper for gate active-session persistence');
assert.equal(busterSource.includes('function writeJsonAtomic('), false, 'buster gate runner must not keep a local writeJsonAtomic helper for gate active-session persistence');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.persistGateActiveSession, 'function', 'shared gate active-session helper should expose persistGateActiveSession');
assert.equal(typeof helperMod.clearGateActiveSession, 'function', 'shared gate active-session helper should expose clearGateActiveSession');

console.log(JSON.stringify({ ok: true, checked: 13 }));
