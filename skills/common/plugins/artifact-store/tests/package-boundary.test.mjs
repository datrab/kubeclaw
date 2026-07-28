import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['src/adapter.ts', 'dist/adapter.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\bcommand\.execute\b/);
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.artifact-store', suite: 'package-boundary' }));
