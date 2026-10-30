import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { renderEventReference, replaceEventReference, schemaKeywordRows } from '../lib/docs-event-reference.mjs';
import { renderReaderMarkdown } from '../docs-reader/renderer.mjs';

const source = { path: 'skills/app/events.ts', line: 4, sourceSha256: 'a'.repeat(64) };
function inventory(expression) {
  return { schemaVersion: 'event-contract-reference.v1', sourceSetSha256: 'b'.repeat(64), families: [{
    id: 'wire_boundary', boundary: 'Declared shape; delivery is conditional.', version: null,
    roles: [{ role: 'producer', source, condition: 'Only when callback is supplied.' }],
    declarations: [{ name: 'Wire', source, members: [{ name: 'field_*', optional: true, type: { expression } }] }],
    constructors: [{ source, fields: [{ name: 'payload', expression }] }],
    limits: ['No receiver binding found; no live-delivery claim.'],
  }] };
}

test('real publication renderer preserves event type and constructor literals without markup injection', () => {
  const expression = "Readonly<{ target_id: '<targetId>'; mask: '*/*'; value: `a|b` }> | null";
  const markdown = renderEventReference(inventory(expression));
  const rendered = renderReaderMarkdown(markdown, 'reference/events.md', new Map([['reference/events.md', '/reference/events.html']]), new Set(), (target) => 'https://example.test/source/' + target.replace(/^\.\.\//u, ''));
  const codes = []; const rows = [];
  const content = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(content).join('');
  function walk(node) {
    if (node.tagName === 'code') codes.push(content(node));
    if (node.tagName === 'tr') rows.push(node);
    assert.notEqual(node.tagName, 'targetid');
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(parse(rendered.html));
  assert.equal(codes.filter((value) => value === expression).length, 2);
  assert(codes.includes('field_*'));
  assert.equal(rows.length, 6);
  assert.match(rendered.html, /No common version asserted/u);
});

test('generated section replacement preserves authored boundaries and rejects malformed/duplicate ownership', () => {
  const generated = renderEventReference(inventory('unknown'));
  const page = replaceEventReference('# Authored\n\nSafety boundary.\n', generated);
  assert.equal(replaceEventReference(page, generated), page);
  assert(page.startsWith('# Authored\n\nSafety boundary.\n'));
  assert.throws(() => replaceEventReference(page + generated, generated), /MARKERS_INVALID/u);
  assert.throws(() => replaceEventReference('<!-- END GENERATED EVENT CONTRACT REFERENCE -->', generated), /MARKERS_INVALID/u);
  const duplicate = inventory('unknown'); duplicate.families.push(duplicate.families[0]);
  assert.throws(() => renderEventReference(duplicate), /DUPLICATE_FAMILY/u);
});

test('recursive schema keyword projection preserves branch scope, open records, nullable values and recursive references', () => {
  const document = { properties: { 'a/b~c': { type: ['string', 'null'], default: null } },
    if: { required: ['a/b~c'] }, then: { additionalProperties: false },
    $defs: { node: { properties: { next: { $ref: '#/$defs/node' } } } },
    'x-future-vocabulary': { value: '*/*', empty: [] } };
  const rows = schemaKeywordRows(document);
  assert(rows.some((row) => row.pointer === '/properties/a~1b~0c/type/1' && row.value === '"null"'));
  assert(rows.some((row) => row.pointer === '/properties/a~1b~0c/default' && row.value === 'null'));
  assert(rows.some((row) => row.pointer === '/if/required/0' && row.value === '"a/b~c"'));
  assert(rows.some((row) => row.pointer === '/then/additionalProperties' && row.value === 'false'));
  assert(rows.some((row) => row.pointer === '/$defs/node/properties/next/$ref' && row.value === '"#/$defs/node"'));
  assert(rows.some((row) => row.pointer === '/x-future-vocabulary/empty' && row.value === 'array (0 entries)'));
  assert(!rows.some((row) => row.pointer === '/required'));
});

test('standalone source remains complete fenced data through the actual reader, including fence-like source text', () => {
  const expression = 'func logJSON(detail interface{}) {\n  // Literal content is handled here, not authored prose.\n  println(````<script>not executable</script>````)\n}';
  const current = inventory('unknown');
  current.families[0].goDeclarations = [{source,expression,meaning:'Lexical source only; no standalone program or execution claim.'}];
  current.families[0].typeValues = [{name:'sourceValue',source,expression}];
  const markdown = renderEventReference(current);
  assert(markdown.includes('`````text\n' + expression + '\n`````'));
  const rendered = renderReaderMarkdown(markdown, 'reference/events.md', new Map([['reference/events.md', '/reference/events.html']]), new Set(), target => 'https://example.test/source/' + target);
  const codes = []; const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  const visit = node => {if(node.tagName==='code')codes.push(text(node));assert.notEqual(node.tagName,'script');for(const child of node.childNodes??[])visit(child)};
  visit(parse(rendered.html));
  assert.equal(codes.filter(value => value === expression + '\n').length, 2);
});
