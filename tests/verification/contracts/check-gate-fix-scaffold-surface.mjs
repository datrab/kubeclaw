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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-fix-scaffold.js');
const reviewPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.js');
const busterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const busterSource = fs.readFileSync(busterPath, 'utf8');

assert.equal(helperSource.includes('export async function startGateForgeFixCycleScaffold('), true, 'shared gate fix scaffold should export startGateForgeFixCycleScaffold');
assert.equal(helperSource.includes('export async function finishGateForgeFixCycleScaffold('), true, 'shared gate fix scaffold should export finishGateForgeFixCycleScaffold');
assert.equal(helperSource.includes('forge-fix-prompt-cycle-'), true, 'shared gate fix scaffold should own Forge fix prompt artifact creation');
assert.equal(helperSource.includes('forge-fix-transcript-cycle-'), true, 'shared gate fix scaffold should own Forge fix transcript artifact archival');
assert.equal(helperSource.includes('persistGateActiveSession('), true, 'shared gate fix scaffold should own gate active-session persistence during fix cycles');

for (const source of [reviewSource, busterSource]) {
  assert.equal(source.includes("from '../services/gate-fix-scaffold.js'"), true, 'gate runners should import the shared fix scaffold');
  assert.equal(source.includes('startGateForgeFixCycleScaffold({'), true, 'gate runners should call the shared fix scaffold start helper');
  assert.equal(source.includes('finishGateForgeFixCycleScaffold({'), true, 'gate runners should call the shared fix scaffold finish helper');
  assert.equal(source.includes('forge-fix-prompt-cycle-'), false, 'runner-local Forge fix prompt artifact handling should be removed');
  assert.equal(source.includes('forge-fix-transcript-cycle-'), false, 'runner-local Forge fix transcript artifact handling should be removed');
}

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.startGateForgeFixCycleScaffold, 'function', 'shared gate fix scaffold should expose startGateForgeFixCycleScaffold');
assert.equal(typeof helperMod.finishGateForgeFixCycleScaffold, 'function', 'shared gate fix scaffold should expose finishGateForgeFixCycleScaffold');

console.log(JSON.stringify({ ok: true, checked: 13 }));
