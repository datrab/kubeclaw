import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/stage.ts'), 'utf8');
assert.doesNotMatch(source, /skills\/(?:nova|buster)\/pipeline|quality-gate-stage|return\s+response\.result/);
assert.match(source, /context\.invoke\('runtime\.dispatch'/);
assert.match(source, /context\.invoke\('artifacts\.write'/);
assert.match(source, /context\.invoke\('test\.suite\.execute'/);
assert.ok(
  source.indexOf("context.invoke('test.suite.execute'") < source.indexOf("context.invoke('runtime.dispatch'"),
  'deterministic suites must execute before reasoning',
);

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['test.suite.execute', 'runtime.dispatch', 'artifacts.write']);
assert.equal(manifest.stages[0].module, 'dist/stage.js');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.buster-quality-gate', suite: 'package-boundary' }));
