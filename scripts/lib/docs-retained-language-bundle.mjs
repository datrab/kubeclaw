import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEditorialSourceRevision, loadRetainedConfigurationSnapshot, stableBundleText } from './docs-retained-source.mjs';
import { buildHistoricalOwners, HISTORICAL_ARTIFACT_REVISION, HISTORICAL_SOURCE_REVISION } from './docs-retained-configuration-owners.mjs';
import { projectRetainedInventoryLanguage } from './docs-retained-configuration-projection.mjs';

export const retainedLanguageSchema = 'kubeclaw-retained-configuration-language.v1';
export const editorialSourceFiles = Object.freeze([
  'scripts/docs-retained-language-projection.mjs',
  'scripts/docs-generate.mjs',
  'scripts/docs-configuration-inventory.mjs',
  'scripts/lib/docs-retained-configuration-renderer.mjs',
  'scripts/lib/docs-retained-yaml-field-path.mjs',
  'scripts/lib/docs-retained-source.mjs',
  'scripts/lib/docs-retained-language-bundle.mjs',
  'scripts/lib/docs-retained-configuration-owners.mjs',
  'scripts/lib/docs-retained-owner-constructors.mjs',
  'scripts/lib/docs-retained-configuration-formatters.mjs',
  'scripts/lib/docs-retained-configuration-projection.mjs',
  'scripts/lib/docs-configuration-editorial-language.mjs',
  'scripts/lib/docs-configuration-reference-guidance.mjs',
]);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

export function buildRetainedLanguageBundle({ root, artifactRevision = HISTORICAL_ARTIFACT_REVISION,
  sourceRevision = HISTORICAL_SOURCE_REVISION, editorialRevision }) {
  const executingRoot = fs.realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
  assert.equal(fs.realpathSync(root), executingRoot, 'RETAINED_EDITORIAL_EXECUTING_ROOT_MISMATCH');
  root = assertEditorialSourceRevision(root, editorialRevision);
  // This adapter reconstructs one authenticated historical owner grammar. An
  // unrelated/new snapshot requires a genuinely implemented owner adapter.
  assert.equal(artifactRevision, HISTORICAL_ARTIFACT_REVISION, 'RETAINED_LANGUAGE_ARTIFACT_UNSUPPORTED');
  assert.equal(sourceRevision, HISTORICAL_SOURCE_REVISION, 'RETAINED_LANGUAGE_OWNER_VERSION_UNSUPPORTED');
  const editorialInputs = editorialSourceFiles.map(relative => {
    const filename = path.join(root, relative);
    assert(fs.lstatSync(filename).isFile() && fs.realpathSync(filename) === filename,
      `RETAINED_EDITORIAL_SOURCE_MUST_BE_PHYSICAL: ${relative}`);
    const bytes = fs.readFileSync(filename);
    return { path: relative, revision: editorialRevision, bytes: bytes.length, sha256: sha(bytes) };
  });
  const snapshot = loadRetainedConfigurationSnapshot({ root, artifactRevision, sourceRevision });
  const { runtimeInputs, configurationValues, ...otherInventories } = snapshot.inventories;
  const historicalOwners = buildHistoricalOwners({ runtimeInputs, configurationValues,
    readSourceText: snapshot.readSourceText, readArtifactJson: snapshot.readArtifactJson });
  const projected = projectRetainedInventoryLanguage({ runtimeInputs, configurationValues, historicalOwners });
  return {
    schemaVersion: retainedLanguageSchema,
    artifactRevision, sourceRevision, editorialRevision,
    provenance: snapshot.provenance,
    inputs: snapshot.inputManifest(),
    editorialInputs,
    inventories: { ...otherInventories, runtimeInputs: projected.runtimeInputs,
      configurationValues: projected.configurationValues },
    changes: projected.changes,
    preservation: projected.preservation,
    limits: {
      currentDiscoveryPerformed: false,
      currentProducerQualificationGranted: false,
      currentApiRoleQualificationGranted: false,
      historicalQualificationsChanged: false,
      ordinaryFullInventoryCheckReplaced: false,
    },
  };
}

// A caller-editable bundle is not an authority. Reconstruct it from authenticated
// Git inputs and the committed current owner before any renderer consumes it.
export function readVerifiedRetainedLanguageBundle({ root, filename }) {
  assert(fs.lstatSync(filename).isFile() && fs.realpathSync(filename) === path.resolve(filename),
    'RETAINED_LANGUAGE_BUNDLE_MUST_BE_PHYSICAL');
  const text = fs.readFileSync(filename, 'utf8');
  const supplied = JSON.parse(text);
  assert.equal(supplied.schemaVersion, retainedLanguageSchema, 'RETAINED_LANGUAGE_BUNDLE_VERSION_INVALID');
  const expected = buildRetainedLanguageBundle({ root, artifactRevision: supplied.artifactRevision,
    sourceRevision: supplied.sourceRevision, editorialRevision: supplied.editorialRevision });
  assert.equal(text, stableBundleText(expected), 'RETAINED_LANGUAGE_BUNDLE_AUTHENTICATION_FAILED');
  return expected;
}
