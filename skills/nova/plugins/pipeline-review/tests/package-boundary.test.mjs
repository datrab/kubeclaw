import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/stage.ts'), 'utf8');
assert.doesNotMatch(source, /skills\/nova\/pipeline|pipeline-review-stage|return\s+response\.result/);
assert.match(source, /context\.invoke\('runtime\.dispatch'/);
assert.match(source, /context\.invoke\('artifacts\.write'/);

const manifest = JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
assert.deepEqual(manifest.stages[0].requiredCapabilities, ['runtime.dispatch', 'artifacts.write']);
assert.equal(manifest.stages[0].module, 'src/stage.ts');

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.pipeline-review', suite: 'package-boundary' }));
