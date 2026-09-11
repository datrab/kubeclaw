import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePrism, validateNodeCatalog, validateEngineRequest, validateEngineResult, PrismContractError, PRISM_JSON_LIMITS } from '../../../contracts/prism/v1/src/index.ts';
import { assertPrismComplexity } from '../../../contracts/prism/v1/src/complexity.ts';
import { resolveView } from '../../../skills/prism/domain/index.ts';
import { PrismEngine, DeterministicDesignProvider } from '../../../skills/prism/engine/index.ts';
import { executePrismOperation } from '../../../skills/prism/engine/worker-binding.ts';
import { engineRequestSchema } from '../../../contracts/prism/v1/src/digest.ts';
import { renderNode } from '../../../skills/prism/renderer/index.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('../../../contracts/prism/v1/fixtures/minimal-web.json', import.meta.url), 'utf8'));
const document = structuredClone(fixture);
document.components = { 'card-item': { title: 'Card', root: { id: 'card-root', type: 'text', props: { content: 'Card' } },
  variants: { compact: { 'card-root': { content: 'Small card' } } } } };
document.views.home.root.children.push({ id: 'card', type: 'component', props: { component: 'card-item' } });
for (const scope of ['states', 'responsive']) {
  const group = scope === 'states' ? 'default' : 'compact';
  for (const patch of [{ component: 'missing-card' }, { component: 'card-item' }, { variant: 'missing' }, { overrides: { missing: { content: 'x' } } }]) {
    const invalid = structuredClone(document);
    invalid.views.home[scope][group].patches.card = patch;
    assert.throws(() => validatePrism('designDocument', invalid), /component references cannot change|missing variant|invalid patch target/);
  }
}
// Component variants and instance overrides use the same target checks.
for (const variantPatch of [{ variant: 'missing' }, { overrides: { missing: { content: 'x' } } }]) {
  const invalid = structuredClone(document);
  invalid.components.wrapper = { title: 'Wrapper', root: { id: 'nested-card', type: 'component', props: { component: 'card-item' } },
    variants: { invalid: { 'nested-card': variantPatch } } };
  assert.throws(() => validatePrism('designDocument', invalid), /missing variant|invalid patch target/);
  delete invalid.components.wrapper.variants;
  invalid.views.home.root.children.push({ id: 'wrapper-node', type: 'component', props: { component: 'wrapper', overrides: { 'nested-card': variantPatch } } });
  assert.throws(() => validatePrism('designDocument', invalid), /missing variant|invalid patch target/);
}
for (const scope of ['states', 'responsive']) {
  const invalid = structuredClone(document);
  invalid.views.home.root.children.push({ id: 'card-list', type: 'list', props: { data: 'items', itemComponent: 'card-item', emptyText: 'None' } });
  invalid.views.home[scope][scope === 'states' ? 'default' : 'compact'].patches['card-list'] = { itemComponent: 'missing' };
  assert.throws(() => validatePrism('designDocument', invalid), /component references cannot change/);
}
document.views.home.states.default.patches.card = { variant: 'compact' };
document.views.home.responsive.compact.patches.card = { overrides: { 'card-root': { content: 'Patched card' } } };
validatePrism('designDocument', document);
assert.match(renderNode(resolveView(document, 'home', 'default', 'compact'), document.assets, { components: document.components }), /Patched card/);
for (const count of [PRISM_JSON_LIMITS.depth, PRISM_JSON_LIMITS.depth + 1]) {
  const chain = structuredClone(fixture);
  const components = Array.from({ length: count }, (_, index) => [`comp-${index}`, { title: `Component ${index}`,
    root: index === 0 ? { id: 'chain-leaf', type: 'text', props: { content: 'Leaf' } }
      : { id: `chain-${index}`, type: 'component', props: { component: `comp-${index - 1}` } } }]);
  for (const ordered of [components, [...components].reverse()]) {
    chain.components = Object.fromEntries(ordered);
    chain.views.home.root = { id: 'chain-root', type: 'component', props: { component: `comp-${count - 1}` } };
    if (count <= PRISM_JSON_LIMITS.depth) assert.doesNotThrow(() => validatePrism('designDocument', chain));
    else assert.throws(() => validatePrism('designDocument', chain), (error) => error instanceof PrismContractError && error.code === 'COMPONENT_DEPTH_EXCEEDED');
  }
}
const deep = structuredClone(fixture);
deep.views.home.mockData = { nested: JSON.parse('['.repeat(252) + '0' + ']'.repeat(252)) };
assert.doesNotThrow(() => validatePrism('designDocument', deep));
deep.views.home.mockData = { nested: JSON.parse('['.repeat(253) + '0' + ']'.repeat(253)) };
assert.throws(() => validatePrism('designDocument', deep), (error) => error instanceof PrismContractError && error.code === 'JSON_DEPTH_EXCEEDED');
const requestContract = engineRequestSchema('render');
await assert.rejects(executePrismOperation(new PrismEngine(new DeterministicDesignProvider()), {
  contractId: 'kubeclaw.prism-design-engine@1', inputSchemaId: requestContract.schemaId, inputSchemaDigest: requestContract.schemaDigest,
  values: { operation: 'render', input: { document: deep, view: 'home', state: 'default', viewport: 'wide' } },
}, 'worker:complexity'), PrismContractError);
const treeDocument = structuredClone(fixture);
treeDocument.views.home.root = '__TREE__';
const nodePrefix = Array.from({ length: 3000 }, (_, i) => `{"id":"node-${i}","type":"stack","props":{"direction":"vertical"},"children":[`).join('');
const treeWire = JSON.stringify(treeDocument).replace('"__TREE__"', nodePrefix + '{"id":"leaf","type":"text","props":{"content":"leaf"}}' + ']}'.repeat(3000));
assert.throws(() => validatePrism('designDocument', JSON.parse(treeWire)), PrismContractError);
const wireDeep = JSON.parse('['.repeat(10_000) + '0' + ']'.repeat(10_000));
assert.throws(() => validateNodeCatalog(wireDeep), PrismContractError);
for (const name of ['designRequest', 'designDocument', 'operation', 'baselineManifest', 'acceptanceCriteria', 'previewIndex', 'preferenceEvent', 'retrievalQuery'] as const) {
  assert.throws(() => validatePrism(name, wireDeep), PrismContractError);
}
for (const operation of ['generate', 'render', 'evaluate', 'ingest', 'publish']) {
  assert.throws(() => validateEngineRequest(operation, { operation, input: { document: deep } }), PrismContractError);
  assert.throws(() => validateEngineResult(operation, { document: deep }), PrismContractError);
}
let batch: unknown = { type: 'node.props.set', baseRevision: 1, nodeId: 'title', props: { content: 'ok' } };
for (let i = 0; i < 3000; i++) batch = { type: 'batch', baseRevision: 1, operations: [batch] };
assert.throws(() => validatePrism('operation', batch), PrismContractError);
const cyclic: unknown[] = []; cyclic.push(cyclic);
assert.throws(() => validatePrism('operation', cyclic), PrismContractError);
assert.doesNotThrow(() => assertPrismComplexity(Array(PRISM_JSON_LIMITS.nodes - 1).fill(0), 'test'));
assert.throws(() => assertPrismComplexity(Array(PRISM_JSON_LIMITS.nodes).fill(0), 'test'), PrismContractError);
assert.doesNotThrow(() => assertPrismComplexity('x'.repeat(PRISM_JSON_LIMITS.bytes - 2), 'test'));
assert.throws(() => assertPrismComplexity('x'.repeat(PRISM_JSON_LIMITS.bytes - 1), 'test'), PrismContractError);
console.log('Prism patch/complexity regressions and real renderer passed');
