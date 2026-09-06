import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/stage.ts'), 'utf8');
assert.doesNotMatch(source, /skills\/(?:nova|buster)\/pipeline|quality-gate-stage|return\s+response\.result/);
assert.match(source, /context\.invoke\('runtime\.dispatch'/);
assert.match(source, /context\.invoke\('artifacts\.write'/);
assert.doesNotMatch(source, /context\.invoke\('test\.suite\.execute'/);
assert.match(source, /context\.invoke\('test\.plan\.execute'/);
assert.doesNotMatch(source, /input\.suiteEvidence|input\.suitePlan/u);

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['test.plan.execute', 'runtime.dispatch', 'artifacts.write', 'artifacts.read']);
assert.equal(manifest.stages[0].module, 'src/stage.ts');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.buster-quality-gate', suite: 'package-boundary' }));
