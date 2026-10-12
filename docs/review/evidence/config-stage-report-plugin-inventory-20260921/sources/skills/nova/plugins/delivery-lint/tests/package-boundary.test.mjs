import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (/\.(?:[cm]?[jt]s|json)$/.test(entry.name)) files.push(file);
  }
}
collect(path.join(root, 'src'));

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /skills\/nova\/pipeline|nova\/pipeline\/services\/validation-delivery/);
  assert.doesNotMatch(source, /\bcommand\.execute\b/);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
assert.deepEqual(manifest.stages.map(({ id }) => id), ['delivery-lint']);
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['git.repository.read', 'artifacts.write']);
console.log(JSON.stringify({ ok: true, plugin: manifest.id, suite: 'package-boundary' }));
