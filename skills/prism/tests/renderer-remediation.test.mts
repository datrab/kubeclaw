import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { validatePrism, type PrismDocument } from '@kubeclaw/prism-contracts-v1';
import { PrismEngine, DeterministicDesignProvider } from '../engine/index.ts';
import { renderNode } from '../renderer/index.ts';
import { previewDocument } from '../studio/preview.ts';

test('original Engine and Studio preserve disjoint component layers and targeted override precedence', async () => {
  for (const overrides of [{ hidden: true }, { content: 'Override' }]) {
    const document = structuredClone(fixture) as PrismDocument;
    document.components = { card: { title: 'Card', root: { id: 'copy', type: 'text', props: { content: 'Base', padding: 12 } },
      variants: { active: { copy: { content: 'Variant', foreground: '#123456' } } } } };
    document.views.home!.root.children = [{ id: 'card-instance', type: 'component', props: { component: 'card', variant: 'active', overrides: { copy: overrides } } }];
    validatePrism('designDocument', document);
    const before = structuredClone(document);
    const engine = new PrismEngine(new DeterministicDesignProvider());
    const rendered = await engine.execute({ contract: 'kubeclaw.prism-design-engine@1', operation: 'render',
      input: { document, view: 'home', state: 'default', viewport: 'wide' }, idempotencyKey: 'layers' });
    for (const html of [String(rendered.output.html), previewDocument(document)]) {
      assert.match(html, /color:#123456/u);
      assert.match(html, /padding:12px/u);
      assert.match(html, 'content' in overrides ? />Override</u : />Variant</u);
      if ('hidden' in overrides) assert.match(html, / hidden/u);
    }
    assert.deepEqual(document, before);
  }
});
test('each declared interactive control has its own escaped action', () => {
  const html = renderNode({ id: 'pages', type: 'pagination', props: { page: 2, pageCount: 3, previousAction: 'back', nextAction: 'forward' } });
  assert.match(html, /data-prism-action="back">Previous/u);
  assert.match(html, /data-prism-action="forward">Next/u);
  assert.match(renderNode({ id: 'tabs', type: 'tabs', props: { items: [{ id: 'tab', label: 'Tab', action: 'open-tab' }], active: 'tab' } }), /data-prism-action="open-tab"/u);
  assert.match(renderNode({ id: 'dialog', type: 'dialog', props: { title: 'Dialog', open: true, dismissAction: 'dismiss' } }), /data-prism-action="dismiss">Close/u);
  assert.match(renderNode({ id: 'empty', type: 'empty-state', props: { title: 'Empty', message: 'None', action: 'create', actionLabel: 'Create' } }), /data-prism-action="create">Create/u);
});
