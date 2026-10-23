import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const generator = new URL('../../../scripts/plugin-system-inventory.mjs', import.meta.url);
test('canonical plugin inventory includes staged sources, not temporary test files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-inventory-scope-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const write = (name, text) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const run = (...args) => execFileSync(process.execPath, ['scripts/plugin-system-inventory.mjs', ...args], { cwd: root, stdio: 'pipe' });
  const read = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/generated/inventory/plugin-system.json'), 'utf8'));
  try {
    git('init', '--quiet');
    write('scripts/plugin-system-inventory.mjs', fs.readFileSync(generator));
    write('skills/nova/plugins/example/plugin.json', JSON.stringify({ id: 'example', stages: [{ id: 'stage' }] }));
    write('skills/nova/plugins/example/src/staged.ts', 'export const staged = true;');
    write('skills/nova/core/staged.ts', 'export const core = true;');
    git('add', '.');
    run();
    const baseline = read();
    assert.equal(baseline.summary.registrations, 1);
    assert.ok(baseline.files.includes('skills/nova/plugins/example/src/staged.ts'));
    assert.ok(baseline.runtime.files.includes('skills/nova/core/staged.ts'));
    write('skills/nova/plugins/example/src/eslint-type-evidence-fixture-random/direct-value.ts', 'temporary');
    write('skills/nova/core/temporary.ts', 'temporary');
    write('skills/nova/plugins/untracked/plugin.json', JSON.stringify({ id: 'temporary' }));
    run('--check');
    run();
    assert.deepEqual(read(), baseline);
    git('add', 'skills/nova/core/temporary.ts');
    assert.throws(() => run('--check'), 'staged source additions must invalidate stale inventory');
    run();
    assert.ok(read().runtime.files.includes('skills/nova/core/temporary.ts'));
    run('--check');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
