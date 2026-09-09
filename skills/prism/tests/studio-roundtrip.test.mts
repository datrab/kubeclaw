import test from 'node:test';
import assert from 'node:assert/strict';
import { prismNodeTypes, validatePrism, type PrismDocument, type PrismNode } from '@kubeclaw/prism-contracts-v1';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { project } from '../studio/projection.ts';
import { puckChangeToOperation } from '../studio/puck-adapter.ts';
import { applyOperation } from '../domain/index.ts';
const props: Record<string, Record<string, unknown>> = {
  stack: { direction: 'horizontal', gap: 24 }, grid: { columns: 5 }, split: { direction: 'vertical', ratio: '2:1' },
  scroll: { direction: 'horizontal' }, overlay: { placement: 'top' }, text: { content: { $data: 'copy' } },
  heading: { content: 'Title', level: 3 }, image: { asset: 'hero' }, icon: { asset: 'hero', decorative: false },
  divider: { direction: 'vertical' }, code: { content: 'code' }, button: { label: 'Go', variant: 'quiet', action: 'go' },
  link: { label: 'Link', action: 'go' }, 'text-input': { label: 'Email', inputType: 'email' },
  select: { label: 'Select', options: [{ value: 'one', label: 'One' }] }, checkbox: { label: 'Checked', checked: true, action: 'go' },
  list: { data: { $data: 'items' }, itemComponent: 'item', emptyText: 'Empty custom' },
  table: { data: { $data: 'items' }, columns: [{ field: 'name', label: 'Custom' }], emptyText: 'Custom table' },
  badge: { label: 'Badge', tone: 'warning' }, progress: { value: 17, max: 20, label: 'Progress' },
  chart: { kind: 'bar', data: { $data: 'items' }, yFields: ['amount'], title: 'Custom chart', legend: true },
  navigation: { label: 'Nav', items: [{ id: 'one', label: 'One', action: 'go' }], orientation: 'horizontal' },
  tabs: { label: 'Tabs', items: [{ id: 'one', label: 'One', action: 'go' }], active: 'one' },
  breadcrumb: { items: [{ label: 'Custom', current: true }] }, pagination: { page: 2, pageCount: 9, previousAction: 'back', nextAction: 'next' },
  alert: { tone: 'danger', message: 'Alert' }, dialog: { title: 'Dialog', open: false, dismissAction: 'close' },
  toast: { tone: 'success', message: 'Toast' }, tooltip: { content: 'Tip' },
  'empty-state': { title: 'Empty', message: 'Message' }, spinner: { label: 'Wait', size: 'large' },
  component: { component: 'item', variant: 'active', overrides: { 'item-text': { hidden: true } } },
  terminal: { title: 'Term', columns: 120, rows: 40 }, command: { prompt: '>', content: 'command' },
  prompt: { label: 'Prompt', inputType: 'password', action: 'submit' }, output: { content: 'out', tone: 'muted' },
};
for (const type of prismNodeTypes) test(`canonical ${type} survives actual projection no-op and another node edit`, () => {
  const document = structuredClone(fixture) as PrismDocument;
  const node: PrismNode = { id: `custom-${type}`, type, props: { ...props[type], padding: 7 } };
  const count = ['split', 'overlay'].includes(type) ? 2 : ['scroll', 'tooltip'].includes(type) ? 1 : 0;
  if (count) node.children = Array.from({ length: count }, (_, i) => ({ id: `nested-${i}`, type: 'text', props: { content: 'Child' } }));
  document.assets = { hero: { kind: 'image', artifact: `artifact:sha256:${'a'.repeat(64)}`, mediaType: 'image/png', role: 'hero' } };
  document.components = { item: { title: 'Item', root: { id: 'item-text', type: 'text', props: { content: 'Base' } }, variants: { active: { 'item-text': { content: 'Variant' } } } } };
  document.views.home!.mockData = { copy: 'Bound copy', items: [] };
  document.views.home!.root.children!.push(node);
  validatePrism('designDocument', document);
  const before = structuredClone(document);
  const projected = JSON.parse(JSON.stringify(project(document, 'home')));
  assert.equal(puckChangeToOperation(document, projected), null);
  projected.content[0].props.text = 'Edited neighbour';
  const operation = puckChangeToOperation(document, projected)!;
  assert.equal(operation.type, 'node.props.set');
  const changed = applyOperation(document, operation);
  assert.deepEqual(changed.views.home!.root.children![1], node);
  assert.deepEqual(document, before);
});
