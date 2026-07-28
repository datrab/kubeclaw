import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/adapter.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.equal(source.includes('runtime.dispatch'), false);
assert.match(source, /fsyncSync/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.wait-store', suite: 'package-boundary' }));
