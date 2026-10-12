import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('src/stage.ts', 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('child_process'), false);
assert.equal(source.includes('runtime.dispatch'), false);
assert.match(source, /git\.sync/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.blueprint-sync', suite: 'package-boundary' }));
