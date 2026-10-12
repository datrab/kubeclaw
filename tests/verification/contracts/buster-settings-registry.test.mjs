import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateComponentSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
import { validateBusterExecutionSettings, validateBusterObservationSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';

// Read authored bytes inside each test, so registry failures are test failures
// rather than a shared-fixture module initialization failure before registration.
function canonicalSettings() {
  return JSON.parse(fs.readFileSync(new URL('../../../charts/kubeclaw/files/config/buster-engine.config.json', import.meta.url), 'utf8')).settings;
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
