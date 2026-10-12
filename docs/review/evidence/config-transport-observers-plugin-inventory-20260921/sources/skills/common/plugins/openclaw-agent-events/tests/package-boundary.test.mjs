import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.resolve('src/adapter.ts'), 'utf8');
assert.equal(source.includes('/pipeline/'), false);
assert.equal(source.includes('../'), false);
assert.match(source, /SUPPORTED_HOOKS/);
assert.doesNotMatch(source, /void context\\.emit/);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.openclaw-agent-events', suite: 'package-boundary' }));
