import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Test-only original producer/runtime source. Maintained source independently
// denies pre-CONFIG execution without original captured Core policy.
export function materializeHistoricalRuntime(root, version, checkout) {
  const target = path.join(root, 'archived-runtime');
  const core = path.join(target, 'skills/nova/core');
  if (fs.existsSync(core)) return core;
  const bytes = fs.readFileSync(new URL('./historical-runtime-producers.json', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'f10877dc4ecb713d79cce6b1b5aaab42e79ddf1df5ad569c6ad8982c100bb4cd');
  const archive = JSON.parse(bytes), selected = archive.versions[version];
  assert(selected);
  const original = {
    v1: ['legacy-source-producer/core/execution/engine-snapshots.ts.txt', 'a63c3f3961ebe8ca86328bf428d419307f539f0b'],
    v2: ['legacy-transport-profile/engine-snapshots-v2.ts.txt', 'acca2d4107e47cc61c5659276e03e62204c62fcf'],
    v3: ['legacy-review-cache/engine-snapshots.ts.txt', '6f5301c0a9d93b4444fd9131021491b2e0a05a64'],
  }[version];
  const snapshot = selected.files.find(file => file.path === 'skills/nova/core/execution/engine-snapshots.ts');
  assert.equal(snapshot.gitBlob, original[1]);
  assert.deepEqual(Buffer.from(archive.blobs[snapshot.gitBlob]), fs.readFileSync(path.join(checkout,
    'tests/verification/reliability/fixtures', original[0])));

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'package.json'), '{"type":"module"}');
  for (const file of selected.files) {
    const destination = path.resolve(target, file.path);
    assert(destination.startsWith(`${target}${path.sep}`));
    const content = Buffer.from(archive.blobs[file.gitBlob]);
    assert.equal(crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex'), file.gitBlob);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  const modules = path.join(target, 'node_modules'); fs.mkdirSync(modules);
  for (const name of fs.readdirSync(path.join(checkout, 'node_modules'))) {
    const original = path.join(checkout, 'node_modules', name);
    const link = (input, output) => {
      const real = fs.realpathSync(input), relative = path.relative(checkout, real);
      const archived = path.join(target, relative);
      fs.symlinkSync(!relative.startsWith('..') && fs.existsSync(archived) ? archived : real, output, 'dir');
    };
    if (name.startsWith('@')) {
      fs.mkdirSync(path.join(modules, name));
      for (const child of fs.readdirSync(original)) link(path.join(original, child), path.join(modules, name, child));
    } else link(original, path.join(modules, name));
  }
  return core;
}
