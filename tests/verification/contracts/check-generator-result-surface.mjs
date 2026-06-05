import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-generator-result-surface' });
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
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/generator-result.ts');
const legacyBarrelPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/index.ts');
const summaryPath = path.join(sourceRoot, 'skills/nova/pipeline/services/summary.ts');
const caseStudyPath = path.join(sourceRoot, 'skills/nova/pipeline/services/case-study.ts');
const projectSummaryPath = path.join(sourceRoot, 'skills/nova/pipeline/services/summary/project-summary.ts');
const schedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts');
const serializationPath = path.join(sourceRoot, 'skills/nova/pipeline/services/serialization.ts');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const summarySource = fs.readFileSync(summaryPath, 'utf8');
const caseStudySource = fs.readFileSync(caseStudyPath, 'utf8');
const projectSummarySource = fs.readFileSync(projectSummaryPath, 'utf8');
const schedulingSource = fs.readFileSync(schedulingPath, 'utf8');
const serializationSource = fs.readFileSync(serializationPath, 'utf8');

for (const marker of [
  'export function buildGeneratorArtifactRef(',
  'export function buildGeneratorResult(',
  'export function isGeneratorResult(',
  'export function coerceGeneratorResult(',
  'export function validateGeneratorArtifactRef(',
  'export function validateGeneratorResult(',
  'export function normalizeGeneratorResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `shared generator helper should export ${marker}`);
}
assert.equal(helperSource.includes("producerKind: 'generator'"), true, 'shared generator helper should own the canonical generator producerKind');
assert.equal(helperSource.includes("hookFamily: 'generator.run'"), true, 'generator normalizer should emit generator.run contract diagnostics');
assert.equal(helperSource.includes('createContractInvalidError'), true, 'generator normalizer should use structured contract-invalid errors');
assert.equal(helperSource.includes('compatibility-shaped'), false, 'generator result normalizer should not preserve compatibility fallback language');
assert.equal(fs.existsSync(legacyBarrelPath), false, 'legacy contracts namespace barrel should stay deleted');
assert.equal(schedulingSource.includes("from '../services/contracts/generator-result.ts'"), true, 'pipeline scheduling should import the shared generator result contract');
assert.equal(schedulingSource.includes('normalizeGeneratorResult('), true, 'pipeline scheduling should normalize generator outputs through the shared contract');
assert.equal(schedulingSource.includes('validateGeneratorResult('), true, 'pipeline scheduling should validate generator outputs through the shared contract');
assert.equal(schedulingSource.includes("result.schemaVersion !== 'v1'"), false, 'pipeline scheduling must not duplicate the generator v1 schema validator');
assert.equal(serializationSource.includes('buildSafeJsonPreview'), false, 'serialization must not keep the deleted raw contract preview helper');

for (const [name, source] of [['summary', summarySource], ['case-study', caseStudySource]]) {
  assert.equal(source.includes("from './contracts/generator-result.ts'"), true, `${name} service should import the shared generator helper`);
  assert.equal(source.includes('function buildGeneratorArtifactRef('), false, `${name} service must not keep a local buildGeneratorArtifactRef helper`);
  assert.equal(source.includes('function buildGeneratorResult('), false, `${name} service must not keep a local buildGeneratorResult helper`);
}
assert.equal(projectSummarySource.includes("from '../contracts/generator-result.ts'"), true, 'project-summary service should import the shared generator helper');

assert.equal(summarySource.includes('reviewGatewayLabel || label'), false, 'pipeline review summary must not use the spawn label as an implicit gateway-label fallback');
assert.equal(summarySource.includes('identity.label'), false, 'pipeline review Discord fields must not treat generic labels as gateway identity');
assert.equal(summarySource.includes('function resolvePipelineReviewGatewayLabel('), true, 'pipeline review summary should resolve gateway labels through an explicit identity helper');

const helperMod = await import(pathToFileURL(helperPath).href);
assert.equal(typeof helperMod.buildGeneratorArtifactRef, 'function', 'shared generator helper should expose buildGeneratorArtifactRef');
assert.equal(typeof helperMod.buildGeneratorResult, 'function', 'shared generator helper should expose buildGeneratorResult');
assert.equal(typeof helperMod.isGeneratorResult, 'function', 'shared generator helper should expose isGeneratorResult');
assert.equal(typeof helperMod.coerceGeneratorResult, 'function', 'shared generator helper should expose coerceGeneratorResult');
assert.equal(typeof helperMod.validateGeneratorArtifactRef, 'function', 'shared generator helper should expose validateGeneratorArtifactRef');
assert.equal(typeof helperMod.validateGeneratorResult, 'function', 'shared generator helper should expose validateGeneratorResult');
assert.equal(typeof helperMod.normalizeGeneratorResult, 'function', 'shared generator helper should expose normalizeGeneratorResult');

const artifact = helperMod.buildGeneratorArtifactRef('pipeline_review', '/tmp/review.md', { role: 'output', format: 'markdown' });
assert.deepEqual(artifact, {
  type: 'pipeline_review',
  path: '/tmp/review.md',
  role: 'output',
  format: 'markdown',
}, 'artifact helper should keep canonical type/path plus metadata extras');
assert.equal(helperMod.buildGeneratorArtifactRef('pipeline_review', null), null, 'artifact helper should return null for missing artifact paths');
assert.deepEqual(helperMod.validateGeneratorArtifactRef(artifact), [], 'valid artifact refs should pass validation');
assert.deepEqual(helperMod.validateGeneratorArtifactRef({ type: '', path: '' }, 'artifact'), [
  'artifact.type must be a non-empty string',
  'artifact.path must be a non-empty string',
], 'invalid artifact refs should report type and path problems');

const result = helperMod.buildGeneratorResult('pipeline_review', {
  artifacts: [artifact, null],
  outputs: { status: 'ok', output: '/tmp/review.md' },
  diagnostics: { post_error: 'non-critical' },
});
assert.equal(helperMod.isGeneratorResult(result, 'pipeline_review'), true, 'built generator results should match the expected producer type');
assert.equal(helperMod.isGeneratorResult(result, 'case_study'), false, 'generator result type checks should reject the wrong producer type');
assert.deepEqual(helperMod.validateGeneratorResult(result, { producerType: 'pipeline_review' }), [], 'built generator results should pass validation');
assert.equal(helperMod.normalizeGeneratorResult(result, { producerType: 'pipeline_review', label: 'Pipeline review' }), result, 'normalizer should return valid generator results unchanged');
assert.deepEqual(result.artifacts, [artifact], 'generator builder should filter falsey artifact refs');

const malformedResult = {
  schemaVersion: 'v0',
  producerKind: 'summary',
  producerType: '',
  outputs: [],
  artifacts: [{ type: 'pipeline_review', path: '' }, null],
  diagnostics: [],
};
assert.deepEqual(helperMod.validateGeneratorResult(malformedResult, {
  producerType: 'pipeline_review',
  stageId: 'generator:pipeline_review',
}), [
  "schemaVersion must be 'v1'",
  "producerKind must be 'generator'",
  'producerType must be a non-empty string',
  "producerType must be 'pipeline_review' for generator:pipeline_review",
  'outputs must be an object',
  'artifacts[0].path must be a non-empty string',
  'artifacts[1] must be an object',
  'diagnostics must be an object when present',
], 'generator validator should report deterministic schema errors');
assert.throws(
  () => helperMod.coerceGeneratorResult({ ok: true }, { producerType: 'pipeline_review' }),
  /generator:pipeline_review plugin output must be a typed generator result; only schemaVersion 'v1' with producerKind 'generator' is accepted/,
  'coercer should reject non-v1/non-generator result shapes without fallback',
);
assert.throws(
  () => helperMod.normalizeGeneratorResult({
    ok: true,
    nested: { auth: { password: 'super-secret-password' } },
  }, { producerType: 'pipeline_review', label: 'Pipeline review' }),
  (error) => {
    const diagnosticText = JSON.stringify(error?.diagnostics || {});
    return error?.name === 'PluginContractInvalidError'
      && error?.code === 'PLUGIN_CONTRACT_INVALID'
      && error?.diagnostics?.hookFamily === 'generator.run'
      && error?.diagnostics?.producerKind === 'generator'
      && error?.diagnostics?.producerType === 'pipeline_review'
      && error?.validationErrors?.[0]?.includes('only schemaVersion')
      && error.diagnostics.rawResultPreview === undefined
      && error.diagnostics.coercedResultPreview === undefined
      && error.diagnostics.rawResultSummary?.redacted === true
      && error.diagnostics.coercedResultSummary === null
      && !diagnosticText.includes('super-secret-password');
  },
  'normalizer should wrap invalid generator shapes in redacted structured contract-invalid diagnostics',
);
assert.throws(
  () => helperMod.normalizeGeneratorResult({ ...result, artifacts: [{ type: 'pipeline_review', path: '' }] }, { producerType: 'pipeline_review' }),
  (error) => error?.name === 'PluginContractInvalidError'
    && error?.validationErrors?.includes('artifacts[0].path must be a non-empty string'),
  'normalizer should reject malformed artifact refs after coercion',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 48 }));
