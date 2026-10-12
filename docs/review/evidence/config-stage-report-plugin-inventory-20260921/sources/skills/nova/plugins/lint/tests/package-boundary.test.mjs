import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve('.');
const productionRoots = ['src'];
const prohibited = [
  {
    pattern: /skills\/nova\/pipeline|nova\/pipeline\/tools\/lint-report/,
    reason: 'must not import the retained v1 lint implementation',
  },
  {
    pattern: /\bcommand\.execute\b/,
    reason: 'must not delegate its domain behavior to an opaque command adapter',
  },
];

function filesBelow(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(absolute));
    else if (/\.(?:[cm]?[jt]s|json)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

const productionFiles = productionRoots.flatMap((root) => filesBelow(path.join(packageRoot, root)));
assert.ok(productionFiles.length > 0, 'lint package must contain production files');

for (const file of productionFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const rule of prohibited) {
    assert.doesNotMatch(source, rule.pattern, `${path.relative(packageRoot, file)} ${rule.reason}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'plugin.json'), 'utf8'));
assert.deepEqual(
  manifest.stages.map((stage) => stage.id).sort(),
  ['full', 'pre-check'],
);
assert.deepEqual(manifest.adapters.map((adapter) => adapter.id), ['executor']);
assert.deepEqual(manifest.adapters[0].providesCapabilities, ['lint.execute']);
assert.ok(
  manifest.stages.every((stage) => stage.requiredCapabilities.includes('lint.execute')),
  'every lint stage must invoke the independently granted lint adapter',
);

console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.lint', suite: 'package-boundary' }));
