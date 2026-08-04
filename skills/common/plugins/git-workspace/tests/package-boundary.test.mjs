import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(
  manifest.adapters[0].providesCapabilities,
  ['git.workspace.create', 'git.workspace.remove', 'git.commit', 'git.merge', 'git.sync'],
);

const sources = ['src/adapter.ts', 'src/operations.ts', 'src/runner.ts', 'src/values.ts']
  .map((file) => fs.readFileSync(file, 'utf8'));
for (const source of sources) {
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|fork)\s*\(/);
}
const runtimeSource = sources.join('\n');
assert.match(runtimeSource, /shell:\s*false/);
assert.match(runtimeSource, /env:\s*\{\}/);
assert.match(runtimeSource, /core\.hooksPath=\/dev\/null/);
assert.match(runtimeSource, /commit\.gpgSign=false/);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.git-workspace',
  suite: 'package-boundary',
}));
