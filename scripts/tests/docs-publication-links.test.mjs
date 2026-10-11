import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { rebaseMarkdownLinks } from '../lib/docs-publication-links.mjs';

const origin = '/repo/docs/site/extend/plugin-catalogue/fixture.md';
const target = '/repo/docs/site/use/plugins.md';

test('shared fixture guidance reaches the same canonical procedure from the operator matrix', () => {
  const text = 'Use [the fixture](../../use/workflows/kubernetes-fixture.md#cleanup) before continuing.';
  const actual = rebaseMarkdownLinks(text, origin, target);
  assert.equal(actual, 'Use [the fixture](workflows/kubernetes-fixture.md#cleanup) before continuing.');
  assert.equal(path.resolve(path.dirname(target), 'workflows/kubernetes-fixture.md'),
    path.resolve(path.dirname(origin), '../../use/workflows/kubernetes-fixture.md'));
  assert.equal(rebaseMarkdownLinks(text, origin, origin), text);
});

test('anchors, images, titles and multiple links retain their original meanings', () => {
  const text = '[Warning](#warning) ![Diagram](<../../understand/diagram image.svg> "Diagram") [Other](../../reference/type(a).md?q=1#field)';
  assert.equal(rebaseMarkdownLinks(text, origin, target),
    '[Warning](../extend/plugin-catalogue/fixture.md#warning) ![Diagram](<../understand/diagram image.svg> "Diagram") [Other](../reference/type(a).md?q=1#field)');
});

test('source citations, external routes and executable examples remain byte-identical', () => {
  const text = '[Source](https://github.com/example/repo/blob/abc/file.ts#L1-L2) [Root](/reference/) [Mail](mailto:owner@example.test) ` [Example](../../wrong.md) `\n```bash\n[Example](../../wrong.md)\n```\n';
  assert.equal(rebaseMarkdownLinks(text, origin, target), text);
});
