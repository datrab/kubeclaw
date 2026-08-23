import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = ['src/adapter.ts', 'src/runner.ts'].map((file) => fs.readFileSync(file, 'utf8'));
for (const source of sources) {
  assert.doesNotMatch(source, /skills\/(?:nova|buster|common)\/pipeline/);
  assert.doesNotMatch(source, /\b(?:exec|execFile|fork)\s*\(/);
}
const runtimeSource = sources.join('\n');
assert.match(runtimeSource, /shell:\s*false/);
assert.match(runtimeSource, /COMMAND_ENVIRONMENT_DENIED/);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.command-runner',
  suite: 'package-boundary',
}));
