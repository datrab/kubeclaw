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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/stage-envelope-primitives.js');
const moduleSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner-shared.js');
const gateRunnerPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/gate-runner.js');
const pipelineSchedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.js');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const moduleSharedSource = fs.readFileSync(moduleSharedPath, 'utf8');
const gateRunnerSource = fs.readFileSync(gateRunnerPath, 'utf8');
const pipelineSchedulingSource = fs.readFileSync(pipelineSchedulingPath, 'utf8');

for (const source of [moduleSharedSource, gateRunnerSource, pipelineSchedulingSource]) {
  assert.equal(source.includes("from './stage-envelope-primitives.js'"), true, 'runner builder families should import the shared stage-envelope primitives');
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

const helperMod = await import(pathToFileURL(helperPath).href);
const moduleSharedMod = await import(pathToFileURL(moduleSharedPath).href);
const gateRunnerMod = await import(pathToFileURL(gateRunnerPath).href);
const pipelineRunnerMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner.js')).href);

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

const refs = helperMod.buildStageRefs({
  runRef: { prefix: 'run', parts: ['run-1'] },
  moduleRef: { prefix: 'module', parts: ['01'] },
  skippedRef: { prefix: 'skip', parts: [''] },
  rawRef: 'already:built',
});
assert.deepEqual(refs, {
  runRef: 'run:run-1',
  moduleRef: 'module:01',
  rawRef: 'already:built',
});

const invocation = helperMod.buildStagePluginInvocation('worker:module_forge', { moduleId: '01', attempt: 2 });
assert.deepEqual(invocation, { stageId: 'worker:module_forge', moduleId: '01', attempt: 2 });

console.log(JSON.stringify({ ok: true, checked: 20 }));
