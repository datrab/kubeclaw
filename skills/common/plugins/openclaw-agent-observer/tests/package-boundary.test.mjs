import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

for (const name of fs.readdirSync(path.resolve('src'))) {
  const file = path.resolve('src', name);
  if (!fs.statSync(file).isFile() || !/\.[cm]?[jt]s$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/(?:nova|buster)\/pipeline|@kubeclaw\/plugin-sdk|plugin\.json/);
}

const manifest = JSON.parse(fs.readFileSync('openclaw.plugin.json', 'utf8'));
assert.equal(manifest.activation.onStartup, true);
assert.equal(fs.existsSync('plugin.json'), false);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.openclaw-agent-observer', suite: 'package-boundary' }));
