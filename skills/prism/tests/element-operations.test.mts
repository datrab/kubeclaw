import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import type { PrismDocument } from '@kubeclaw/prism-contracts-v1';
import { applyOperation } from '../domain/index.ts';
import { elements, reorderElement, textProperty } from '../studio/element-operations.ts';

function design(): PrismDocument {
  const document = structuredClone(fixture) as PrismDocument;
  document.views.home!.root.children = [
    { id: 'group-one', type: 'stack', props: { direction: 'vertical', gap: 24 }, children: ['alpha','beta','gamma'].map(id => ({ id, type: 'text', props: { content: id } })) },
    { id: 'group-two', type: 'stack', props: { direction: 'vertical' }, children: [{ id: 'other', type: 'text', props: { content: 'Other group' } }] },
  ];
  return document;
}
test('pointer and button reordering uses final sibling positions and preserves the rest of the canonical design', () => {
  const original = design();
  const operation = reorderElement(original, 'home', 'beta', 'gamma');
  assert.ok(operation);
  const saved = applyOperation(original, operation);
  assert.deepEqual(saved.views.home!.root.children![0]!.children!.map(node => node.id), ['alpha','gamma','beta']);
  assert.deepEqual(saved.views.home!.root.children![0]!.props, original.views.home!.root.children![0]!.props);
  assert.deepEqual(saved.views.home!.root.children![1], original.views.home!.root.children![1]);
  assert.equal(saved.meta.revision, original.meta.revision + 1);
  assert.deepEqual(original.views.home!.root.children![0]!.children!.map(node => node.id), ['alpha','beta','gamma']);
});
test('reordering cannot silently move a root, cross groups or act on an unknown view/element', () => {
  const document = design();
  for (const [source,target] of [['alpha','other'],['alpha','alpha'],['missing','beta'],[document.views.home!.root.id,'alpha']]) assert.equal(reorderElement(document,'home',source!,target!),null);
  assert.deepEqual(elements(document,'missing-view'),[]);
});
test('a stale reorder is rejected by the real revision contract instead of overwriting another edit', () => {
  const document = design();const operation = reorderElement(document,'home','alpha','beta');assert.ok(operation);
  const newer = applyOperation(document,{type:'node.props.set',baseRevision:document.meta.revision,nodeId:'alpha',props:{content:'Changed elsewhere'}});
  assert.throws(()=>applyOperation(newer,operation),/revision/i);
});
test('text editing selects an existing string property, never replaces structured data bindings', () => {
  assert.equal(textProperty({id:'message',type:'alert',props:{tone:'info',message:'Try again'}}),'message');
  assert.equal(textProperty({id:'binding',type:'text',props:{content:{$data:'private'}}}),undefined);
});
