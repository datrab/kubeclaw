import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const file of ['src/adapter.ts', 'src/adapter.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/nova\/pipeline|skills\/common\/pipeline/);
  assert.doesNotMatch(source, /\bcommand\.execute\b/);
}
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.repository-adapter', suite: 'package-boundary' }));
