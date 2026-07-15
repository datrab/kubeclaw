import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-gate-fix-scaffold-surface' });
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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/gate-fix-scaffold.ts');
const reviewPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/review-gate-runner.ts');
const busterPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-runner.ts');
const busterFixCyclePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/buster-gate-fix-cycle.ts');
const sharedForgeFixCyclePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-forge-fix-cycle.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const reviewSource = fs.readFileSync(reviewPath, 'utf8');
const busterSource = fs.readFileSync(busterPath, 'utf8');
const busterFixCycleSource = fs.readFileSync(busterFixCyclePath, 'utf8');
const sharedForgeFixCycleSource = fs.readFileSync(sharedForgeFixCyclePath, 'utf8');

assert.equal(helperSource.includes('export async function startGateForgeFixCycleScaffold('), true, 'shared gate fix scaffold should export startGateForgeFixCycleScaffold');
assert.equal(helperSource.includes('export async function finishGateForgeFixCycleScaffold('), true, 'shared gate fix scaffold should export finishGateForgeFixCycleScaffold');
assert.equal(helperSource.includes('forge-fix-prompt-cycle-'), true, 'shared gate fix scaffold should own Forge fix prompt artifact creation');
assert.equal(helperSource.includes('forge-fix-transcript-cycle-'), true, 'shared gate fix scaffold should own Forge fix transcript artifact archival');
assert.equal(helperSource.includes('persistGateActiveSession('), true, 'shared gate fix scaffold should own gate active-session persistence during fix cycles');
assert.equal(helperSource.includes('function promptText('), true, 'shared gate fix scaffold should normalize prompt-result objects to prompt text');
assert.equal(helperSource.includes('const fixPromptText = promptText(fixPrompt);'), true, 'shared gate fix scaffold should derive explicit prompt text before spawning Forge');
assert.equal(helperSource.includes("deps.spawnAgent(config, progress, 'forge', fixLabel, forgeModel, fixPromptText"), true, 'shared gate fix scaffold should pass explicit prompt text into Forge spawn');

assert.equal(sharedForgeFixCycleSource.includes("from '../services/gate-fix-scaffold.ts'"), true, 'shared Forge fix-cycle engine should import the shared fix scaffold');
assert.equal(sharedForgeFixCycleSource.includes('startGateForgeFixCycleScaffold({'), true, 'shared Forge fix-cycle engine should call the shared fix scaffold start helper');
assert.equal(sharedForgeFixCycleSource.includes('finishGateForgeFixCycleScaffold({'), true, 'shared Forge fix-cycle engine should call the shared fix scaffold finish helper');
assert.equal(sharedForgeFixCycleSource.includes('gate_fix_git_persistence_degraded'), true, 'shared Forge fix-cycle engine should surface typed degraded Git persistence evidence');
assert.equal(sharedForgeFixCycleSource.includes('degraded: gitPersistenceDegraded'), true, 'shared Forge fix-cycle engine should return degraded Git persistence state in the typed fix outcome');
assert.equal(sharedForgeFixCycleSource.includes('callMaybe('), false, 'shared Forge fix-cycle engine should not use generic message fallback resolution');
assert.equal(sharedForgeFixCycleSource.includes("throw new Error(`Gate fix-cycle message '"), true, 'shared Forge fix-cycle engine should fail when adapter-owned message fields are missing');
for (const source of [busterFixCycleSource]) {
  for (const requiredMessage of ['startLevel', 'healthFailedLog', 'rateLimitLogLevel', 'successDescription']) {
    assert.equal(source.includes(`${requiredMessage}:`), true, `gate fix-cycle adapters should provide ${requiredMessage}`);
  }
  assert.equal(source.includes('gitPersistenceDegraded'), true, 'gate fix-cycle adapters should own degraded Git persistence copy');
  assert.equal(source.includes('Git persistence is degraded'), true, 'gate fix-cycle adapters should not describe degraded Git persistence as committed');
}
for (const source of [sharedForgeFixCycleSource, busterFixCycleSource]) {
  assert.equal(source.includes('forge-fix-prompt-cycle-'), false, 'consumer-local Forge fix prompt artifact handling should be removed');
  assert.equal(source.includes('forge-fix-transcript-cycle-'), false, 'consumer-local Forge fix transcript artifact handling should be removed');
}
assert.equal(reviewSource.includes("from './review-gate-fix-cycle.ts'"), false, 'review gate runner should not keep an auto-fix cycle adapter');
assert.equal(busterSource.includes("from './buster-gate-fix-cycle.ts'"), true, 'buster gate runner should delegate fix-cycle effects to the extracted helper');
assert.equal(busterFixCycleSource.includes("from './gate-forge-fix-cycle.ts'"), true, 'buster fix-cycle adapter should delegate shared mechanics to the generic Forge fix-cycle engine');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.startGateForgeFixCycleScaffold, 'function', 'shared gate fix scaffold should expose startGateForgeFixCycleScaffold');
assert.equal(typeof helperMod.finishGateForgeFixCycleScaffold, 'function', 'shared gate fix scaffold should expose finishGateForgeFixCycleScaffold');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 16 }));
