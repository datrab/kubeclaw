import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('src/observers.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.match(source, /redactStructuredValue/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.agent-observability', suite: 'package-boundary' }));
