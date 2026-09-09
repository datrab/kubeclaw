import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Render } from '@puckeditor/core';
import { validatePrism, type PrismDocument } from '@kubeclaw/prism-contracts-v1';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { config } from './puck-config.tsx';
import { project } from './projection.ts';

await test('installed Puck renders both actual Studio slot components with nested projected content', () => {
  const document = validatePrism<PrismDocument>('designDocument', structuredClone(fixture));
  document.views.home!.root.children = [{ id: 'nested-stack', type: 'stack', props: { direction: 'vertical', gap: 12 }, children: [
    { id: 'nested-grid', type: 'grid', props: { columns: 2 }, children: [
      { id: 'nested-text', type: 'text', props: { content: 'Nested actual Puck slot' } },
    ] },
  ] }];
  validatePrism('designDocument', document);
  const html = renderToStaticMarkup(<Render config={config} data={project(document, 'home')} />);
  assert.match(html, /class="canvas-stack"/u);
  assert.match(html, /data-prism-type="grid"/u);
  assert.match(html, /<p>Nested actual Puck slot<\/p>/u);
});
