import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const file of ['src/stage.ts', 'src/protocol.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.includes('/pipeline/'), false);
  assert.equal(source.includes('child_process'), false);
}
assert.doesNotMatch(fs.readFileSync('src/stage.ts', 'utf8'), /as StageResult/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.implementation-agent', suite: 'package-boundary' }));
