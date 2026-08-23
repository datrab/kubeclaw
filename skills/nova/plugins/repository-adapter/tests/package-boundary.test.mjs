import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRevisionInventory } from '../src/revision-parsers.ts';
for (const file of ['src/adapter.ts', 'src/adapter.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/nova\/pipeline|skills\/common\/pipeline/);
  assert.doesNotMatch(source, /\bcommand\.execute\b/);
}
assert.deepEqual(parseRevisionInventory(Buffer.from(`160000 commit ${'a'.repeat(40)} -\tmodules/example\0`), String), [
  { mode: '160000', objectId: 'a'.repeat(40), sizeBytes: 0, path: 'modules/example' },
]);
const ordered = parseRevisionInventory(Buffer.from(
  `100644 blob ${'b'.repeat(40)} 1\ta/file\0` + `100644 blob ${'c'.repeat(40)} 1\tZ/file\0`,
), String);
assert.deepEqual(ordered.map(({ path: file }) => file), ['Z/file', 'a/file']);
assert.deepEqual(parseRevisionInventory(Buffer.from(
  `100644 blob ${'d'.repeat(40)} 1\tpath/with\nnewline.ts\0`,
), String).map(({ path: file }) => file), ['path/with\nnewline.ts']);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.repository-adapter', suite: 'package-boundary' }));
