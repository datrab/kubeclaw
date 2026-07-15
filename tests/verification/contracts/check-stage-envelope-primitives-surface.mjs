import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-stage-envelope-primitives-surface' });
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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/stage-envelope-primitives.ts');
const moduleSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.ts');
const gateRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.ts');
const pipelineSchedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts');
const pipelineSchedulingSnapshotsPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling/snapshots.ts');
const waitableGateEnginePath = path.join(sourceRoot, 'skills/nova/pipeline/runners/waitable-gate-engine.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const moduleSharedSource = fs.readFileSync(moduleSharedPath, 'utf8');
const gateRunnerSource = fs.readFileSync(gateRunnerPath, 'utf8');
const waitableGateEngineSource = fs.readFileSync(waitableGateEnginePath, 'utf8');
const pipelineSchedulingSource = [pipelineSchedulingPath, pipelineSchedulingSnapshotsPath]
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n');

for (const source of [moduleSharedSource, gateRunnerSource, pipelineSchedulingSource]) {
  assert.equal(source.includes("from './stage-envelope-primitives.ts'"), true, 'runner builder families should import the shared stage-envelope primitives');
}

for (const marker of [
  'export function buildStageRefs(',
  'export function buildStagePluginInvocation(',
  'export function collectExistingArtifactRefs(',
]) {
  assert.equal(helperSource.includes(marker), true, `stage-envelope primitives should export ${marker}`);
}

for (const marker of [
  'collectExistingArtifactRefs(',
  'buildStageRefs(',
  'buildStagePluginInvocation(',
]) {
  assert.equal(moduleSharedSource.includes(marker), true, `module runner shared builder surface should use ${marker}`);
}

for (const marker of [
  'collectExistingArtifactRefs(',
  'buildStageRefs(',
  'buildStagePluginInvocation(',
]) {
  assert.equal(gateRunnerSource.includes(marker), true, `gate runner builder surface should use ${marker}`);
}

for (const marker of [
  'collectExistingArtifactRefs(',
  'buildStageRefs(',
  'buildStagePluginInvocation(',
]) {
  assert.equal(pipelineSchedulingSource.includes(marker), true, `pipeline scheduling builder surface should use ${marker}`);
}

assert.equal(moduleSharedSource.includes('function pushArtifactRef('), false, 'module runner shared should not keep a local artifact-ref existence helper after slice 6');
assert.equal(pipelineSchedulingSource.includes('const pushIfPresent ='), false, 'pipeline scheduling should not keep a local artifact-ref existence helper after slice 6');
assert.equal(helperSource.includes("throw new Error(`Malformed stage ref '${key}'"), true, 'stage refs must fail typed validation instead of silently omitting malformed refs');
assert.equal(
  helperSource.includes('if (selectTruthyValue(() => (!artifact?.path), () => (!existsFn(String(artifact.path))))) continue;'),
  true,
  'optional artifact refs must include only materialized artifacts as named policy',
);
assert.equal(waitableGateEngineSource.includes('resolveGateWaitController(waitController'), true, 'waitable gate engine must fail fast through wait-controller validation');
assert.equal(waitableGateEngineSource.includes('error.gateStageStarted = true'), false, 'waitable gate loop must not mutate errors to signal stage-start evidence');
assert.equal(waitableGateEngineSource.includes('return { controlResult: null, error, stageStarted: true };'), true, 'waitable gate loop errors should return typed stage-start evidence');
assert.equal(waitableGateEngineSource.includes('finalizeGateCompatibilityResult(loopResult.compatibilityProjection'), false, 'waitable gate engine must not project typed controls into compatibility results');

const helperMod = await import(pathToFileURL(helperPath).href);
const moduleSharedMod = await import(pathToFileURL(moduleSharedPath).href);
const gateRunnerMod = await import(pathToFileURL(gateRunnerPath).href);
const pipelineRunnerMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts')).href);

for (const [mod, name] of [
  [helperMod, 'buildStageRefs'],
  [helperMod, 'buildStagePluginInvocation'],
  [helperMod, 'collectExistingArtifactRefs'],
  [moduleSharedMod, 'buildModuleForgeRunInput'],
  [moduleSharedMod, 'buildModuleBusterRunInput'],
  [moduleSharedMod, 'buildModuleWorkerPluginInvocation'],
  [gateRunnerMod, 'runGate'],
  [pipelineRunnerMod, 'runScheduledGenerator'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

assert.throws(() => helperMod.buildStageRefs({
  skippedRef: { prefix: 'skip', parts: [''] },
}), /Malformed stage ref 'skippedRef'/);
assert.throws(() => helperMod.buildStageRefs({
  missingPrefix: { parts: ['run-1'] },
}), /Malformed stage ref 'missingPrefix'/);
assert.throws(() => helperMod.buildStageRefs({
  missingParts: { prefix: 'run' },
}), /Malformed stage ref 'missingParts'/);
assert.throws(() => helperMod.buildStageRefs({
  rawEmpty: '  ',
}), /Malformed stage ref 'rawEmpty'/);

const refs = helperMod.buildStageRefs({
  runRef: { prefix: 'run', parts: ['run-1'] },
  moduleRef: { prefix: 'module', parts: ['01'] },
  rawRef: 'already:built',
});
assert.deepEqual(refs, {
  runRef: 'run:run-1',
  moduleRef: 'module:01',
  rawRef: 'already:built',
});

const invocation = helperMod.buildStagePluginInvocation('worker:module_forge', { moduleId: '01', attempt: 2 });
assert.deepEqual(invocation, { stageId: 'worker:module_forge', moduleId: '01', attempt: 2 });

const existingArtifacts = helperMod.collectExistingArtifactRefs([
  { kind: 'present', path: '/tmp/present' },
  { kind: 'missing', path: '/tmp/missing' },
  { kind: 'empty', path: '' },
], (artifactPath) => artifactPath === '/tmp/present');
assert.deepEqual(existingArtifacts, [{ kind: 'present', path: '/tmp/present' }]);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 29 }));
