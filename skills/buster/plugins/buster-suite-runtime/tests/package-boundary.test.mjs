import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.equal(manifest.id, 'kubeclaw.buster-suite-runtime');
assert.deepEqual(manifest.adapters, []);
assert.equal(manifest.stages.length, 0);
assert.equal(manifest.observers.length, 0);

assert.equal(fs.existsSync('src/adapter.ts'), false);
assert.equal(fs.existsSync('src/worker.ts'), false);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.buster-suite-runtime',
  suite: 'retired-authority',
}));
