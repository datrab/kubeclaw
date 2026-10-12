import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.adapters.map((entry) => entry.id), ['publisher', 'telemetry']);
assert.deepEqual(manifest.adapters.map((entry) => entry.providesCapabilities), [['transport.publish'], ['telemetry.emit']]);
const source = fs.readFileSync('src/adapter.ts', 'utf8');
assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/u);
assert.doesNotMatch(source, /child_process|fetch\s*\(/u);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.redis-transport', suite: 'package-boundary' }));
