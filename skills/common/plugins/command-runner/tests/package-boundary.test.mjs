import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['src/adapter.ts', 'dist/adapter.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|fork)\s*\(/);
  assert.match(source, /shell:\s*false/);
  assert.match(source, /env:\s*\{\}/);
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.command-runner',
  suite: 'package-boundary',
}));
