import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(
  manifest.adapters[0].providesCapabilities,
  ['git.workspace.create', 'git.workspace.remove', 'git.commit', 'git.merge', 'git.sync'],
);

for (const file of ['src/adapter.ts', 'dist/adapter.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|fork)\s*\(/);
  assert.match(source, /shell:\s*false/);
  assert.match(source, /env:\s*\{\}/);
  assert.match(source, /core\.hooksPath=\/dev\/null/);
  assert.match(source, /commit\.gpgSign=false/);
}

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.git-workspace',
  suite: 'package-boundary',
}));
