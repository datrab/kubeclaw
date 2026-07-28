import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('src/observer.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.match(source, /lifecycleNotification/);
assert.match(source, /previewNotification/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.notification-observer', suite: 'package-boundary' }));
