import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['src/adapter.ts', 'src/adapter.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\bsecrets\.read\b/);
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.network-http', suite: 'package-boundary' }));
