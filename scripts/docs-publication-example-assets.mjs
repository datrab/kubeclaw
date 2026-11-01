import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePluginManifest, validateReferencedSchema, validateContractValue } from '../skills/common/plugin-runtime/foundation/registry/schema.ts';
import * as native from './docs-publication-example-native.mjs';
import { validatePrism, validateEngineRequest } from '../contracts/prism/v1/src/index.ts';

export function validateExampleAssets(root, assets) {
  const site = path.join(root, 'docs/site');
  const read = relative => fs.readFileSync(path.join(site, relative), 'utf8');
  const json = relative => JSON.parse(read(relative));
  const syntax = [];
  const parsedJson = [];
  for (const relative of assets) {
    if (/\.(?:mjs|js)$/u.test(relative)) {
      execFileSync(process.execPath, ['--check', path.join(site, relative)], {
        encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' },
      });
      syntax.push(relative);
    } else if (relative.endsWith('.json')) { json(relative); parsedJson.push(relative); }
    else throw new Error(`PUBLICATION_EXAMPLE_ASSET_FAMILY_UNIMPLEMENTED:${relative}`);
  }
  const teachingPackages = ['extend/examples/minimal-stage', 'extend/examples/observer-lifecycle/plugin',
    'use/workflows/examples/uncertain-effect/plugin'];
  const packages = teachingPackages.map(directory => {
    const location = `${directory}/plugin.json`;
    const manifest = parsePluginManifest(read(location), path.join(site, location));
    const schemas = assets.filter(file => file.startsWith(`${directory}/schemas/`)
      && (directory === 'use/workflows/examples/uncertain-effect/plugin'
        ? ['config.json', 'input.json', 'result.json'].some(name => file === `${directory}/schemas/${name}`)
        : file.endsWith('.schema.json')));
    for (const file of schemas) validateReferencedSchema(read(file), path.join(site, file));
    return { id: manifest.id, nativeManifestAndSchemaCompilation: true, schemas, activation: false };
  });
  // This is graph/schema and private-package validation, not an effect run.
  // Runtime loss/receipt/receiver observations retain their independent real case.
  const uncertainGraph = json('use/workflows/examples/uncertain-effect.pipeline.json');
  native.validateGraphExample(uncertainGraph);
  assert.equal(uncertainGraph.id, 'reader-uncertain-effect');
  assert.equal(uncertainGraph.stages.length, 1);
  assert.equal(uncertainGraph.stages[0].type, 'example.uncertain-effect.mutate');
  assert.deepEqual(uncertainGraph.stages[0].execution,
    { maxAttempts: 3, maxRemediationCycles: 0, timeoutMs: 20000 });
  // Parse the actual new canonical inputs; no helper, provider or runtime is executed.
  native.validateGraphExample(json('use/workflows/examples/minimal.pipeline.json'));
  const prismRequest = json('use/workflows/examples/prism-studio-flow.json');
  validateEngineRequest('generate', prismRequest);
  validatePrism('designDocument', prismRequest.input.document);
  const governance = execFileSync(process.execPath, [path.join(root, 'scripts/docs-governance.mjs'), '--check'],
    { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  assert.match(governance, /documentation governance passed \([0-9]+ pages mapped\)/u);
  const projectFactories = native.validateProjectFactories(root);
  const matrix = native.validateTestScopeExample(root,
    json('use/workflows/examples/buster-fixture-matrix-report.pipeline.json'), { moduleId: 'web', gateId: null }, true);
  const signal = native.validateApprovalSignalExample(json('use/workflows/wait-resume/signal.template.json'), true);
  const browserCompanions = native.validateBrowserCompanions(root);
  const exercise = json('extend/examples/platform-change-nova-lifecycle.json');
  assert.equal(exercise.schemaVersion, 'kubeclaw-platform-change-exercise.v1');
  assert.match(exercise.purpose, /records no execution result/u);
  let completeStageResults = 0;
  for (const item of exercise.cases) if (item.input?.result) {
    validateContractValue('stageResult', item.input.result); completeStageResults++;
  }
  const conceptualTraces = ['request-trace-success', 'request-trace-redis-unavailable'].map(name => {
    const value = json(`use/workflows/examples/${name}.json`);
    assert.equal(value.schemaVersion, 'kubeclaw.documented-request-trace.v1');
    if (name === 'request-trace-redis-unavailable') {
      assert.equal(value.status, 'contract-example-not-live-proof');
      assert.equal(value.scenarioId, 'container-build-redis-unavailable');
      assert.equal(value.baseScenario, 'complete-showcase-success in request-trace-success.json');
      assert.equal(value.orderedRecovery.length, 7);
      assert.equal(value.authorityAfterFailure.length, 5);
      for (const field of ['injectedCondition', 'safeStopRule', 'recoveryOwner', 'boundedRetryRule', 'completionCondition']) {
        assert(typeof value[field] === 'string' && value[field].trim(), `${name}: incomplete recovery ${field}`);
      }
      return { name, documentedFailureAndRecoveryReferenceOnly: true, actualRunEvidence: false };
    }
    assert.equal(value.status, 'conceptual-reference-only-not-live-proof');
    assert.equal(value.steps.length, 20);
    assert.deepEqual(value.steps.map(step => step.order), Array.from({ length: 20 }, (_, index) => index + 1));
    for (const step of value.steps) {
      assert(typeof step.evidenceStatus === 'string' && step.evidenceStatus.includes('no live evidence'));
      for (const field of ['component', 'inputIdentity', 'action', 'outputIdentity', 'decisionOwner', 'safeStop']) {
        assert(typeof step[field] === 'string' && step[field].trim(), `${name}: incomplete conceptual ${field}`);
      }
    }
    return { name, conceptualReferenceOnly: true, actualRunEvidence: false };
  });
  return { syntaxOnlyAssets: syntax, parsedJsonAssets: parsedJson, packages, projectFactories,
    governanceMapAndRouteOwner: true,
    uncertainEffectGraph: { nativeSchemaAndGraph: true, privateTeachingPackage: true, activation: false, effectExecuted: false },
    matrix, signal, browserCompanions, completeExerciseStageResults: completeStageResults,
    conceptualTraces, runtimeJourneyReexecuted: false,
    retainedRuntimeJourneyQualification: 'Separate original full-vector evidence; syntax/compilation never replaces it' };
}
