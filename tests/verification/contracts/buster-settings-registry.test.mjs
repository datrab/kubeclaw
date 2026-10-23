import assert from 'node:assert/strict';
import test from 'node:test';
import { captureSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { canonicalPipelineEntry, readTestPipeline, busterRuntimeSelection } from '../../fixtures/config/pipeline-components.mjs';
import { validateComponentSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { validateBusterExecutionSettings, validateBusterObservationSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';

// Read authored bytes inside each test, so registry failures are test failures
// rather than a shared-fixture module initialization failure before registration.
function canonicalSettings() {
  const documents = readTestPipeline();
  return captureSwarmSettings(canonicalPipelineEntry, busterRuntimeSelection(documents)).components['buster-engine'].settings;
}

for (const [definition, field] of [
  ['buster-preparation', 'preparation'],
  ['buster-admission', 'admission'],
  ['buster-dependency-readiness', 'dependencyReadiness'],
  ['buster-execution', 'execution'],
]) {
  test(`runtime settings registry accepts authored ${definition}`, () => {
    const value = canonicalSettings()[field];
    assert.doesNotThrow(() => validateComponentSettings(definition, value, `UNREGISTERED_OR_INVALID:${definition}`));
  });
}

test('actual execution and observation decoders accept unchanged canonical policy', () => {
  const authored = canonicalSettings().execution;
  const execution = validateBusterExecutionSettings(authored);
  assert.deepEqual(execution, authored);
  assert.deepEqual(validateBusterObservationSettings(authored.observation), authored.observation);
  assert.doesNotThrow(() => validateComponentSettings('buster-execution-observation', authored.observation, 'OBSERVATION_REGISTRY_INVALID'));
});
