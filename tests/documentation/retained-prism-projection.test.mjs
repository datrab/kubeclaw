import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadRetainedConfigurationSnapshot } from '../../scripts/lib/docs-retained-source.mjs';
import { buildHistoricalOwners, HISTORICAL_ARTIFACT_REVISION, HISTORICAL_SOURCE_REVISION } from '../../scripts/lib/docs-retained-configuration-owners.mjs';
import { projectRetainedInventoryLanguage } from '../../scripts/lib/docs-retained-configuration-projection.mjs';
import { projectRetainedPrismSemantics } from '../../scripts/lib/docs-retained-prism-semantics.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function inputs() {
  const snapshot = loadRetainedConfigurationSnapshot({ root, artifactRevision: HISTORICAL_ARTIFACT_REVISION,
    sourceRevision: HISTORICAL_SOURCE_REVISION });
  const historicalOwners = buildHistoricalOwners({ ...snapshot.inventories,
    readSourceText: snapshot.readSourceText, readArtifactJson: snapshot.readArtifactJson });
  const v1 = projectRetainedInventoryLanguage({ ...snapshot.inventories, historicalOwners });
  return { ...v1, historicalOwners, readSourceText: snapshot.readSourceText, readArtifactJson: snapshot.readArtifactJson };
}

test('finite semantic changes reverse to every complete v1 fact; only15 Secret consumer leaves change', () => {
  const args = inputs(); const beforeRuntime = structuredClone(args.runtimeInputs), beforeValues = structuredClone(args.configurationValues);
  const next = projectRetainedPrismSemantics(args);
  assert.deepEqual(args.runtimeInputs, beforeRuntime); assert.deepEqual(args.configurationValues, beforeValues);
  const secrets = next.changes.filter(change => change.jsonPointer.startsWith('/secrets/'));
  assert.equal(secrets.length, 15);
  assert(secrets.every(change => change.inventory === 'runtimeInputs' && /^\/secrets\/\d+\/consumerAuthority$/u.test(change.jsonPointer)));
  const restored = { runtimeInputs: structuredClone(next.runtimeInputs), configurationValues: structuredClone(next.configurationValues) };
  for (const change of [...next.changes].reverse()) {
    assert(['runtimeInputs', 'configurationValues'].includes(change.inventory));
    const path = change.jsonPointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = path.pop(); let object = restored[change.inventory]; for (const part of path) object = object[part];
    assert.deepEqual(object[key], change.newValue); object[key] = change.oldValue;
  }
  assert.deepEqual(restored.runtimeInputs, beforeRuntime);
  assert.deepEqual(restored.configurationValues, beforeValues);
  assert.equal(next.meaningEvidence.environment.length, 11);
  assert.equal(next.meaningEvidence.helm.length, 16);
  assert.equal(next.meaningEvidence.secrets.length, 15);
  assert.equal(next.preservation.notCurrentAcquisition, true);
});

test('missing, ambiguous, retyped and caller-added facts or changed historical readers are rejected', () => {
  const args = inputs();
  for (const mutate of [
    runtime => runtime.environment.pop(),
    runtime => runtime.environment.push(structuredClone(runtime.environment.find(entry => entry.name === 'PRISM_INGRESS_SECRET'))),
    runtime => { runtime.secrets[25].consumerAuthority = 'caller substitute'; },
    runtime => { runtime.environment[0].unknownCallerProperty = true; },
    runtime => { runtime.secrets[0].name = 123; },
  ]) {
    const runtimeInputs = structuredClone(args.runtimeInputs); mutate(runtimeInputs);
    assert.throws(() => projectRetainedPrismSemantics({ ...args, runtimeInputs }), /COMPLETE_V1_RUNTIME_INPUT_DRIFT/);
  }
  const values = structuredClone(args.configurationValues); values.files[0].documents[0].fields[0].unknownCallerProperty = true;
  assert.throws(() => projectRetainedPrismSemantics({ ...args, configurationValues: values }), /COMPLETE_V1_VALUES_INPUT_DRIFT/);
  assert.throws(() => projectRetainedPrismSemantics({ ...args, readSourceText: path => args.readSourceText(path) + '\n// changed body\n' }), /SOURCE_GRAMMAR_DRIFT/);
  assert.throws(() => projectRetainedPrismSemantics({ ...args, readArtifactJson: path => {
    const value = args.readArtifactJson(path); value.unapprovedProperty = true; return value;
  } }), /ARTIFACT_MODEL_DRIFT/);
});
