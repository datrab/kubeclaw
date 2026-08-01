import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

for (const directory of ['src']) {
  for (const name of fs.readdirSync(path.resolve(directory), { recursive: true })) {
    const file = path.resolve(directory, name);
    if (!fs.statSync(file).isFile() || !/\.[cm]?[jt]s$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /skills\/nova\/pipeline|review-gate-/);
    assert.doesNotMatch(source, /\bas StageResult\b/);
    assert.doesNotMatch(source, /return\s+response\.result/);
  }
}

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['runtime.dispatch']);
assert.equal(manifest.stages[0].module, 'src/stage.ts');

const schema = JSON.parse(fs.readFileSync(
  'schemas/reviewer-output.schema.json',
  'utf8',
));
assert.equal(schema.additionalProperties, false);
assert.deepEqual(schema.properties.status.enum, ['PASS', 'FAIL']);

console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.review',
  suite: 'package-boundary',
}));
