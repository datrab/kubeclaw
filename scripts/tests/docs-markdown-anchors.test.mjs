import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownAnchorEntries } from '../lib/docs-markdown-anchors.mjs';

function anchors(source) {
  return markdownAnchorEntries(source).map(({ anchor, level }) => [anchor, level]);
}

test('recognizes ATX and Setext headings inside CommonMark containers', () => {
  assert.deepEqual(anchors([
    'Top level',
    '=========',
    '',
    '> Quoted title',
    '> ------------',
    '',
    '- ### Listed ATX',
    '',
    '> - Nested title',
    '>   ============',
    '',
    '10. Ordered item',
    '',
    '    ### Continued ordered heading',
    '',
    '> 10. Quoted ordered item',
    '>',
    '>     ### Quoted continued heading',
    '',
  ].join('\n')), [
    ['top-level', 1],
    ['quoted-title', 2],
    ['listed-atx', 3],
    ['nested-title', 1],
    ['continued-ordered-heading', 3],
    ['quoted-continued-heading', 3],
  ]);
});

test('accepts exact HTML fragment attributes and rejects misleading attributes', () => {
  assert.deepEqual(anchors([
    '<div data-id="false-id" id = real-unquoted name="not-an-anchor"></div>',
    '<span ID = "Spaced-ID"></span>',
    '<a data-id=also-false name = link-fragment></a>',
    '<section data-name="false-name"></section>',
    '<div title=" id=not-real " class="box">No anchor</div>',
    '<div title="2 > 1" id=real-after-angle></div>',
    '<div id="real&amp;entity"></div>',
    '',
  ].join('\n')), [
    ['real-unquoted', 7],
    ['Spaced-ID', 7],
    ['link-fragment', 7],
    ['real-after-angle', 7],
    ['real&entity', 7],
  ]);
});

test('uses rendered heading text for references, entities, and autolinks', () => {
  assert.deepEqual(anchors([
    '# [Heading][label]',
    '# [Collapsed][]',
    '# [Shortcut]',
    '# Fish &amp; Chips',
    '# Cost &copy; 2026',
    '# <https://example.com>',
    '',
    '[label]: target.md',
    '[collapsed]: target.md',
    '[shortcut]: target.md',
  ].join('\n')), [
    ['heading', 1],
    ['collapsed', 1],
    ['shortcut', 1],
    ['fish--chips', 1],
    ['cost--2026', 1],
    ['httpsexamplecom', 1],
  ]);
});

test('does not create headings or explicit anchors from code and raw HTML contents', () => {
  assert.deepEqual(anchors([
    '```md',
    'Fenced fake',
    '===========',
    '<a id="fenced-fake"></a>',
    '```',
    '',
    '    Indented fake',
    '    =============',
    '',
    '<div>',
    '# Raw HTML fake',
    '</div>',
    '<template id="real-template"><h2 id="inert-template">x</h2></template>',
    '',
    'Visible Setext',
    '---------------',
    '',
  ].join('\n')), [['real-template', 7], ['visible-setext', 2]]);
});

test('an unterminated HTML comment hides anchors through end of file', () => {
  assert.deepEqual(anchors('<!--\n# Fake heading\n<a id="fake-html">\n'), []);
});

test('indented code inside list containers cannot create explicit anchors', () => {
  assert.deepEqual(anchors([
    '1. Item',
    '',
    '       <a id="fake-list-code"></a>',
    '',
    '> 1. Item',
    '>',
    '>        <a id="fake-quote-list-code"></a>',
  ].join('\n')), []);
});
