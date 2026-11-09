#!/usr/bin/env node
// Actual registered gate, isolated source changes, no generated-page regeneration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'error-code');
const variant = family.variants.find(item => item.id === 'runtime-error-family');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-error-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run('npm', ['run', family.gate]); }
try {
  for (const relative of ['package.json', 'scripts/check-error-code-drift.mjs', 'scripts/generate-buster-error-reference.mjs', 'skills/buster/engine', 'skills/buster/plugins', ...variant.expectedPages]) {
    const target = path.join(temporary, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, relative), target, { recursive: true });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  const source = path.join(temporary, variant.sourceAuthority);
  const original = fs.readFileSync(source);
  const pages = variant.expectedPages.map(page => fs.readFileSync(path.join(temporary, page)));
  const baseline = gate();
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  console.log('error-code baseline: PASS');
  for (const operation of family.operations) {
    const id = `${family.kind}:${variant.id}:${operation}`;
    const emit = () => run(process.execPath, ['scripts/docs-ap09-mutation-fixture.mjs', '--emit', id], { cwd: root });
    const patch = emit();
    assert.equal(patch.status, 0, patch.stderr);
    assert.equal(emit().stdout, patch.stdout, `${id}: nondeterministic constructor`);
    assert.deepEqual([...patch.stdout.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)].flatMap(match => [match[1], match[2]]), [variant.sourceAuthority, variant.sourceAuthority]);
    const apply = run('git', ['apply', '-'], { input: patch.stdout });
    assert.equal(apply.status, 0, apply.stderr);
    try {
      const result = gate();
      assert(result.status > 0, `${id}: mutated gate stayed green`);
      const output = result.stdout + result.stderr;
      assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
      variant.expectedPages.forEach((page, index) => {
        assert(output.includes(page), `${id}: missing affected page ${page}`);
        assert(fs.readFileSync(path.join(temporary, page)).equals(pages[index]), `${id}: gate wrote generated page`);
      });
      console.log(`${id}: rejected by ${family.gate}; ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
    } finally { fs.writeFileSync(source, original); }
    const restored = gate();
    assert.equal(restored.status, 0, `${id}: restored baseline failed: ${restored.stdout}${restored.stderr}`);
  }
  console.log('error-code Add/Change/Remove: 3/3 rejected; restored baselines PASS (bounded tooling proof, not independent A911-11 acceptance)');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
