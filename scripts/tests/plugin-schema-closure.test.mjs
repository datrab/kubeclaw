import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireSchemaClosure } from '../plugin-schema-closure.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr13-schema-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  return { root, write };
}
test('raw source and transitive canonical contract drift are visible', t => {
  const { root, write } = fixture(t);
  write('input.json', { $ref: 'https://example.test/contract#/$defs/item' });
  write('contract.json', { $id: 'https://example.test/contract', $defs: { item: { $ref: './leaf' } } });
  write('leaf.json', { $id: 'https://example.test/leaf', type: 'string' });
  const acquire = () => acquireSchemaClosure({ root, source: 'input.json', bindings: { 'https://example.test/contract': 'contract.json', 'https://example.test/leaf': 'leaf.json' } });
  const original = acquire();
  assert.equal(original.documents.length, 3);
  assert.deepEqual(original.diagnostics, []);
  write('leaf.json', { $id: 'https://example.test/leaf', type: 'number' });
  assert.notDeepEqual(acquire(), original);
  fs.unlinkSync(path.join(root, 'leaf.json'));
  assert.match(acquire().diagnostics.join('\n'), /ENOENT/);
});
test('inline false/null and data-shaped refs are preserved without fetching', t => {
  const { root, write } = fixture(t);
  write('manifest.json', {});
  for (const schema of [false, null]) assert.equal(acquireSchemaClosure({ root, source: 'manifest.json', schema }).documents[0].schema, schema);
  write('schema.json', { default: { $ref: 'https://data.invalid/' }, properties: { x: { $ref: 'https://unknown.invalid/schema' } } });
  const result = acquireSchemaClosure({ root, source: 'schema.json' });
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0], /unknown.invalid/);
  assert.doesNotMatch(result.diagnostics[0], /data.invalid/);
});
test('cycles terminate, edits and deletion remain observable', t => {
  const { root, write } = fixture(t);
  write('a.json', { $ref: './b.json' });
  write('b.json', { $ref: './a.json' });
  const acquire = () => acquireSchemaClosure({ root, source: 'a.json' });
  assert.equal(acquire().documents.length, 2);
  const before = acquire();
  write('a.json', { $ref: './b.json', required: ['passwordSecret'] });
  assert.notDeepEqual(acquire(), before);
  fs.unlinkSync(path.join(root, 'a.json'));
  assert.throws(acquire, /ENOENT/);
});
test('local escape and mismatched explicit binding produce diagnostics', t => {
  const { root, write } = fixture(t);
  write('a.json', { allOf: [{ $ref: '../outside.json' }, { $ref: 'https://example.test/a' }] });
  write('bound.json', { $id: 'https://example.test/b' });
  const result = acquireSchemaClosure({ root, source: 'a.json', bindings: { 'https://example.test/a': 'bound.json' } });
  assert.equal(result.diagnostics.length, 2);
  assert.match(result.diagnostics.join('\n'), /escapes repository/);
  assert.match(result.diagnostics.join('\n'), /does not declare ID/);
});
test('contentSchema and recursive refs acquire transitive documents without treating examples as schemas', t => {
  const { root, write } = fixture(t);
  write('input.json', { contentSchema: { $ref: './content.json' },
    $defs: { recursive: { $recursiveRef: 'https://example.test/recursive#' } },
    examples: [{ contentSchema: { $ref: 'https://data.invalid/not-schema' } }] });
  write('content.json', { type: 'string' });
  write('recursive.json', { $id: 'https://example.test/recursive', $recursiveAnchor: true,
    properties: { child: { $recursiveRef: '#' } } });
  const acquire = () => acquireSchemaClosure({ root, source: 'input.json',
    bindings: { 'https://example.test/recursive': 'recursive.json' } });
  const before = acquire();
  assert.deepEqual(before.documents.map(row => row.source), ['content.json', 'input.json', 'recursive.json']);
  assert.deepEqual(before.diagnostics, []);
  write('content.json', { type: 'number' }); assert.notDeepEqual(acquire(), before);
  fs.unlinkSync(path.join(root, 'recursive.json'));
  assert.match(acquire().diagnostics.join('\n'), /ENOENT/);
  write('recursive.json', { $id: 'https://example.test/recursive', $recursiveAnchor: true, $recursiveRef: '#' });
  assert.deepEqual(acquire().diagnostics, []);
});
