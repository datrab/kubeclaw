import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const registration = manifest.stages[0];

assert.equal(manifest.id, 'kubeclaw.human-approval');
assert.deepEqual(registration.requiredCapabilities, ['operator.request', 'signal.wait']);
assert.equal(registration.type, 'kubeclaw.decision.human-approval');
assert.deepEqual(manifest.observers, []);
assert.deepEqual(manifest.adapters, []);

for (const name of ['config', 'input']) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', `${name}.schema.json`), 'utf8'));
  assert.equal(schema.additionalProperties, false);
}

const source = fs.readdirSync(path.join(root, 'src'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => fs.readFileSync(path.join(root, 'src', file), 'utf8'))
  .join('\n');
assert.doesNotMatch(source, /skills\/nova\/pipeline|skills\/common\/pipeline/);
assert.doesNotMatch(source, /runtime\.dispatch|command\.execute|fs\.|node:fs/);
assert.match(source, /operator\.request/);
assert.match(source, /signal\.wait/);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.human-approval', suite: 'boundary' }));
