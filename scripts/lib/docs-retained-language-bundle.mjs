import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEditorialSourceRevision, loadRetainedConfigurationSnapshot, stableBundleText, retainedSemanticSourceManifest } from './docs-retained-source.mjs';
import { buildHistoricalOwners, HISTORICAL_ARTIFACT_REVISION, HISTORICAL_SOURCE_REVISION } from './docs-retained-configuration-owners.mjs';
import { projectRetainedPrismSemantics, PRISM_SEMANTIC_RECEIVERS } from './docs-retained-prism-semantics.mjs';
import { projectRetainedInventoryLanguage } from './docs-retained-configuration-projection.mjs';

export const retainedSemanticSchema = 'kubeclaw-retained-configuration-semantics.v2';
export const semanticOwnerFiles = Object.freeze([
  'scripts/docs-runtime-consumer-contracts.mjs', 'scripts/generate-local-helm-authorities.mjs',
  'scripts/lib/docs-prism-helm-semantic-corrections.mjs',
  'scripts/lib/docs-retained-prism-semantics.mjs', 'scripts/lib/docs-retained-prism-historical-models.mjs',
  'scripts/docs-generate-core.mjs',
  'scripts/lib/docs-retained-semantic-evidence.mjs',
]);
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
  sourceRevision = HISTORICAL_SOURCE_REVISION, editorialRevision, semanticOwnerRevision = null }) {
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
  if (semanticOwnerRevision !== null) assert.equal(semanticOwnerRevision, editorialRevision,
    'RETAINED_SEMANTIC_OWNER_MUST_MATCH_EDITORIAL_REVISION');
  const semanticInputs = semanticOwnerRevision === null ? null
    : retainedSemanticSourceManifest(root, semanticOwnerRevision, PRISM_SEMANTIC_RECEIVERS,
      [...editorialSourceFiles, ...semanticOwnerFiles]);
  const snapshot = loadRetainedConfigurationSnapshot({ root, artifactRevision, sourceRevision });
  const { runtimeInputs, configurationValues, ...otherInventories } = snapshot.inventories;
  const historicalOwners = buildHistoricalOwners({ runtimeInputs, configurationValues,
    readSourceText: snapshot.readSourceText, readArtifactJson: snapshot.readArtifactJson });
  const projected = projectRetainedInventoryLanguage({ runtimeInputs, configurationValues, historicalOwners });
  const semantics = semanticOwnerRevision === null ? null : projectRetainedPrismSemantics({
    runtimeInputs: projected.runtimeInputs, configurationValues: projected.configurationValues,
    historicalOwners, readSourceText: snapshot.readSourceText, readArtifactJson: snapshot.readArtifactJson,
  });
  return {
    schemaVersion: semantics === null ? retainedLanguageSchema : retainedSemanticSchema,
    ...(semantics === null ? {} : { semanticOwnerRevision, semanticInputs,
      meaningEvidence: semantics.meaningEvidence, semanticPreservation: semantics.preservation }),
    artifactRevision, sourceRevision, editorialRevision,
    provenance: snapshot.provenance,
    inputs: snapshot.inputManifest(),
    editorialInputs,
    inventories: { ...otherInventories, runtimeInputs: semantics?.runtimeInputs ?? projected.runtimeInputs,
      configurationValues: semantics?.configurationValues ?? projected.configurationValues },
    changes: [...projected.changes, ...(semantics?.changes ?? [])],
    preservation: semantics === null ? projected.preservation : {
      legacyEditorialProjection: projected.preservation, semanticProjection: semantics.preservation,
    },
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
  assert([retainedLanguageSchema, retainedSemanticSchema].includes(supplied.schemaVersion), 'RETAINED_LANGUAGE_BUNDLE_VERSION_INVALID');
  assert.equal(supplied.schemaVersion === retainedSemanticSchema, Object.hasOwn(supplied, 'semanticOwnerRevision'),
    'RETAINED_LANGUAGE_BUNDLE_SEMANTIC_MODE_INVALID');
  const expected = buildRetainedLanguageBundle({ root, artifactRevision: supplied.artifactRevision,
    sourceRevision: supplied.sourceRevision, editorialRevision: supplied.editorialRevision, semanticOwnerRevision: supplied.semanticOwnerRevision ?? null });
  assert.equal(text, stableBundleText(expected), 'RETAINED_LANGUAGE_BUNDLE_AUTHENTICATION_FAILED');
  return expected;
}
