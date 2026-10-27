#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationPages, publicationAssets } from './lib/docs-publication-assets.mjs';
import { validatePublicationClaimContracts } from './lib/docs-publication-claim-contracts.mjs';
import { bindPublicationExampleCoverage } from './lib/docs-publication-example-coverage.mjs';
import * as native from './docs-publication-example-native.mjs';
import { validateSdkLiteralExamples, validateCanonicalSdkProgram } from './docs-publication-sdk-examples.mjs';
import { validateSdkParserExamples } from './docs-publication-sdk-parser-examples.mjs';
import { validateSdkProjection, validateLeaseRuleProjection, validateDiagramProjection, validateStatusProjection, validateHelmKeyTemplates, validateWorkflowProjection } from './docs-publication-example-projections.mjs';
import { validateExampleAssets } from './docs-publication-example-assets.mjs';
import { validateInstructionSyntax } from './docs-publication-instruction-syntax.mjs';
import { validateEmbeddedYaml } from './docs-publication-embedded-yaml.mjs';
import { validateRetentionNativeAssertion } from './docs-publication-retention-assertion.mjs';
import { verifyGeneratedPublicationExampleProjections } from './docs-publication.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mandatoryInputs = {
  'workflow-projection': ['docs/site/reference/workflows.md'],
  'retention-sql-assertion': ['docs/site/understand/data-and-state.md#block-2'],
  'embedded-yaml': ['docs/site/use/diagnose.md#block-22', 'docs/site/use/install.md#block-10'],
  'sdk-pure-example': ['docs/site/reference/sdk.md#block-3'],
  manifest: ['docs/site/extend/first-plugin.md#block-2'],
  'buster-runtime': ['docs/site/reference/buster-runtime-configuration.md#block-1'],
  platform: ['docs/site/reference/pipeline-platform.md#block-1'],
  'wait-template': ['docs/site/reference/capabilities.md#block-1'],
  graph: ['docs/site/reference/pipeline-definition.md#block-1'],
  compact: ['docs/site/reference/configuration-precedence.md#block-1', 'docs/site/reference/host-and-prism-configuration.md#block-1'],
  'helm-overlays': ['docs/site/reference/configuration-precedence.md#block-2', 'docs/site/reference/configuration-precedence.md#block-3', 'docs/site/reference/configuration-precedence.md#block-4'],
  'test-scope': ['docs/site/reference/pipeline-json.md#block-1'],
  'pair-template': ['docs/site/reference/project-pipeline-publication.md#block-6'],
  'receiver-template': ['docs/site/use/workflows/wait-resume.md#block-15'],
  'approval-signal': ['docs/site/use/operate.md#block-10'],
  deliverables: ['docs/site/reference/nova-project.md#block-3'],
  'prism-payload': ['docs/site/use/prism-studio.md#block-10'],
  'prism-development-document': ['docs/site/use/prism-studio.md'],
};

export async function validatePublicationExamples(root) {
  const site = path.join(root, 'docs/site');
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const pages = publicationPages(site, JSON.parse(read('docs/config/documentation-tree-classification.json')));
  const assets = publicationAssets(site);
  const declaration = JSON.parse(read('docs/config/publication-example-claims.json'));
  const { sources, checks } = bindPublicationExampleCoverage(root, pages, assets, declaration);
  const input = ref => { assert(sources.has(ref), `missing classified example input: ${ref}`); return sources.get(ref); };
  const json = ref => JSON.parse(input(ref));
  const assetJson = name => json(`docs/site/${name}`);
  const fullSdk = () => input('docs/site/reference/sdk-exports.md');
  const actions = {
    'workflow-projection': async () => validateWorkflowProjection(root, input(mandatoryInputs['workflow-projection'][0])),
    'retention-sql-assertion': async () => validateRetentionNativeAssertion(root, input(mandatoryInputs['retention-sql-assertion'][0])),
    'embedded-yaml': async () => validateEmbeddedYaml(root),
    'claim-contract': async () => validatePublicationClaimContracts(declaration, sources),
    'catalogue-script-fidelity': async () => verifyGeneratedPublicationExampleProjections(),
    'sdk-projection': async () => validateSdkProjection(root),
    'sdk-selected-native': async () => ({ values: validateSdkLiteralExamples(fullSdk()),
      parsers: await validateSdkParserExamples(fullSdk()), literalSourceFragmentsNotRuntimePrograms: true }),
    'sdk-pure-example': async () => validateCanonicalSdkProgram(root, input(mandatoryInputs['sdk-pure-example'][0])),
    'cel-projection': async () => validateLeaseRuleProjection(root, input('docs/site/reference/buster-namespace-lease.md')),
    diagram: async () => validateDiagramProjection(root, pages),
    manifest: async () => { native.validateManifestExample(input(mandatoryInputs.manifest[0]), mandatoryInputs.manifest[0]); return { nativeManifestSchema: true }; },
    'buster-runtime': async () => native.validateBusterExample(root, json(mandatoryInputs['buster-runtime'][0])),
    platform: async () => native.validatePlatformExample(json(mandatoryInputs.platform[0])),
    'wait-template': async () => native.validateWaitTemplate(root, assetJson('use/workflows/wait-resume/platform.template.json'),
      assetJson('use/workflows/wait-resume/approval.pipeline.json'), json(mandatoryInputs['wait-template'][0])),
    graph: async () => { native.validateGraphExample(json(mandatoryInputs.graph[0])); return { nativeSchemaAndGraph: true, installedStageAdmission: false }; },
    compact: async () => native.validateCompactExamples(...mandatoryInputs.compact.map(json),
      JSON.parse(read('charts/kubeclaw/files/config/swarm.config.json'))),
    'helm-overlays': async () => native.validateHelmOverlayExamples(root, mandatoryInputs['helm-overlays'].map(input)),
    'test-scope': async () => native.validateTestScopeExample(root, json(mandatoryInputs['test-scope'][0]), { moduleId: 'api', gateId: null }),
    'pair-template': async () => ({ template: native.validatePublishedPairManifestTemplate(json(mandatoryInputs['pair-template'][0])),
      actualOwnedPair: await native.validatePublishedPairExample(json(mandatoryInputs['test-scope'][0])) }),
    'receiver-template': async () => native.validateReceiverReceiptTemplate(json(mandatoryInputs['receiver-template'][0])),
    'approval-signal': async () => native.validateApprovalSignalExample(json(mandatoryInputs['approval-signal'][0])),
    deliverables: async () => native.validateDeliverablesExample(input(mandatoryInputs.deliverables[0])),
    'status-fidelity': async () => validateStatusProjection(root),
    'prism-payload': async () => native.validatePrismPayloadTemplate(json(mandatoryInputs['prism-payload'][0])),
    'prism-development-document': async () => native.validatePrismDevelopmentDocument(),
    'assets-native': async () => validateExampleAssets(root, assets),
    'helm-option-templates': async () => validateHelmKeyTemplates(input('docs/site/reference/helm-values.md')),
    'syntax-instructions': async () => validateInstructionSyntax(declaration.pages.map(page => page.path), sources),
  };
  // Syntax and full asset/companion duties are intentionally mandatory. Missing
  // implementation cannot become an implicit fragment/generated exemption.
  for (const id of ['syntax-instructions', 'assets-native', 'helm-option-templates']) {
    assert.equal(typeof actions[id], 'function', `PUBLICATION_EXAMPLE_ACTION_UNIMPLEMENTED:${id}`);
  }
  assert.equal(checks.length, Object.keys(actions).length, 'example action catalogue changed without implementation');
  const expected = new Set(Object.keys(actions));
  for (const check of checks) {
    assert(expected.delete(check.id), `unknown or duplicate example action: ${check.id}`);
    assert.equal(check.validator, check.id, `example action implementation binding changed: ${check.id}`);
    if (mandatoryInputs[check.id]) assert.deepEqual(check.inputs, mandatoryInputs[check.id], `native input relabelled or omitted: ${check.id}`);
  }
  assert.equal(expected.size, 0, 'required example action omitted');
  const results = [];
  for (const check of checks) {
    const result = await actions[check.id]();
    assert(result && typeof result === 'object', `native action returned no result: ${check.id}`);
    results.push({ id: check.id, inputs: check.inputs.map(ref => ({ ref, sha256: hash(input(ref)) })), result });
  }
  const joinedContracts = validatePublicationClaimContracts(declaration, sources, results);
  return { joinedContracts, schemaVersion: 'kubeclaw-publication-example-results.v1', ok: true,
    pages: pages.length, blocks: declaration.pages.reduce((count, page) => count + page.blocks.length, 0),
    assets: assets.length, results, liveDeploymentOrWholeDocumentationAcceptance: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await validatePublicationExamples(path.resolve(import.meta.dirname, '..')))); }
  catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1; }
}
