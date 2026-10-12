import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/adapter.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.equal(source.includes('runtime.dispatch'), false);
assert.match(source, /FileDurableRecordStore/);
const records = fs.readFileSync(path.resolve('../../plugin-runtime/foundation/observability/durable-records.ts'), 'utf8');
assert.match(records, /export \{ FileDurableBlobStore, type DurableBlobStore \} from '\.\/durable-blobs\.ts'/);
const durable = [records, fs.readFileSync(path.resolve('../../plugin-runtime/foundation/observability/durable-blobs.ts'), 'utf8')].join('\n');
assert.match(durable, /handle\.sync\(\)/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.wait-store', suite: 'package-boundary' }));
