import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['src/observer.ts', 'src/observer.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\bredis\b/i);
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.telemetry-observer', suite: 'package-boundary' }));
