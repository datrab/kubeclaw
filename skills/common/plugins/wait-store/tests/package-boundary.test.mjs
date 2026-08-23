import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/adapter.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.equal(source.includes('runtime.dispatch'), false);
assert.match(source, /FileDurableRecordStore/);
const durable = fs.readFileSync(path.resolve('../../plugin-runtime/foundation/observability/durable-records.ts'), 'utf8');
assert.match(durable, /handle\.sync\(\)/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.wait-store', suite: 'package-boundary' }));
