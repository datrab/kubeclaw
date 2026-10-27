import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { buildWorkflowInventory } from './docs-inventory.mjs';
import { renderWorkflowTable, generatedNotice } from './docs-generate-core.mjs';
import { renderProductPipeline } from './docs-product-pipeline-reference.mjs';
import { checkSdkReference } from './docs-sdk-reference.mjs';
import { publicationExampleBlocks } from './lib/docs-publication-example-coverage.mjs';
import { collectDocumentationDiagrams } from './docs-reader/diagrams.mjs';
import { renderStatus } from './docs-status.mjs';
import { validateHelmOptionTemplates } from './docs-publication-example-native.mjs';

export function validateSdkProjection(root) {
  const revision = JSON.parse(fs.readFileSync(path.join(root,
    'docs/generated/inventory/documentation-source-revision.json'), 'utf8')).revision;
  const { inventory } = checkSdkReference({ root, revision,
    inventoryPath: path.join(root, 'docs/generated/inventory/sdk-reference.json'),
    markdownPath: path.join(root, 'docs/site/reference/sdk-exports.md') });
  return { nativeCompilerSchemaAndAuthoredProjection: true, exports: inventory.exports.length,
    consumerStringsExecutedOrTypechecked: false };
}

export function validateLeaseRuleProjection(root, markdown) {
  const source = fs.readFileSync(path.join(root, 'charts/kubeclaw/templates/buster-namespace-lease-crd.yaml'), 'utf8');
  // These are source-projected CEL strings, not standalone deployment inputs.
  // Decode the actual YAML string scalar without substituting Helm policy or
  // pretending a chart render, Kubernetes CEL evaluation or admission occurred.
  const rules = [...source.matchAll(/^\s*- rule: (.+)$/gmu)].map(match => {
    const value = YAML.parse(`- rule: ${match[1]}`)[0].rule;
    assert(typeof value === 'string' && value.length > 0, 'unsupported lease rule scalar');
    return value;
  });
  const blocks = publicationExampleBlocks(markdown).filter(block => block.info === 'cel');
  assert.equal(rules.length, 22, 'lease rule source responsibility changed');
  assert.deepEqual(blocks.map(block => block.content.trim()), rules, 'published CEL source projection drift');
  return { exactYamlRuleStringProjection: true, rules: rules.length,
    helmRenderOrCelEvaluationOrAdmission: false };
}

export function validateDiagramProjection(root, pages) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/config/documentation-diagrams.json'), 'utf8'));
  const definitions = collectDocumentationDiagrams(pages.map(file => ({
    relative: path.relative(path.join(root, 'docs/site'), file).split(path.sep).join('/'),
    text: fs.readFileSync(file, 'utf8'),
  })), registry);
  return { nativeRegistrySourceAndTextAlternative: true, diagrams: definitions.length,
    visualRenderOrSemanticReassessment: false };
}

export function validateStatusProjection(root) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'docs/status/open-issues.json'), 'utf8'));
  const text = renderStatus(data);
  assert.equal(fs.readFileSync(path.join(root, 'docs/site/status/open-issues.md'), 'utf8'), text,
    'published issue procedures differ from their actual owner');
  return { nativeIssueSchemaAndRenderProjection: true, issues: data.issues.length,
    reproductionOrLiveValidationExecution: false };
}

export function validateHelmKeyTemplates(markdown) {
  const options = [...markdown.matchAll(/--set '[^'\n]+=<value>'/gu)].map(match => match[0]);
  const paths = [
    ['nodeSelector', 'kubeclaw.io/log-collector'],
    ['spire-server', 'controllerManager', 'identities', 'clusterSPIFFEIDs', 'default', 'podSelector', 'matchLabels', 'kubeclaw.dev/worker-trust'],
    ...[[], ['adapter'], ['port']].map(tail => ['capabilityProviders', 'buster', 'capabilities', 'runtime.dispatch', ...tail]),
    ...[[], ['adapter'], ['port'], ['proxyPort'], ['scheme']].map(tail => ['capabilityProviders', 'buster', 'capabilities', 'test.plan.execute', ...tail]),
    ...[[], ['adapter'], ['authentication'], ['port'], ['proxyPort']].map(tail => ['capabilityProviders', 'prism', 'capabilities', 'runtime.dispatch', ...tail]),
  ];
  assert.equal(options.length, paths.length, 'Helm option-template responsibility changed');
  return { keys: validateHelmOptionTemplates(options.map((option, index) => ({ option, expectedPath: paths[index] }))),
    productValueSchemaOrDeployment: false };
}

export function validateWorkflowProjection(root, markdown) {
  const inventory = buildWorkflowInventory(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'docs/generated/inventory/workflows.json'), 'utf8')), inventory,
    'workflow example inventory differs from its real source owner');
  const marker = '## Workflows\n\n';
  assert.equal(markdown.split(marker).length, 2, 'workflow native section boundary changed');
  const section = markdown.split(marker)[1].split('\n## Product pipeline source revision\n')[0];
  assert.equal(section.trim(), `${renderWorkflowTable(inventory)}\n${renderProductPipeline(root)}`.trim(),
    'workflow example table/pipeline differs from its native renderer');
  assert(markdown.includes(generatedNotice(inventory.generatedFrom)), 'workflow source file projection changed');
  return { nativeWorkflowInventoryTableAndProductPipelineProjection: true,
    workflowFiles: inventory.workflows.length, workflowJobsExecuted: false,
    completeGlobalGeneratorFreshnessOrSourcePinAward: false };
}
