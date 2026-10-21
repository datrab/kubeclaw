#!/usr/bin/env node
// Bounded plugin-manifest variant only; NOT the full registered registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'plugin-registration');
const variant = family.variants.find(item => item.id === 'plugin-manifest');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-manifest-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run('npm', ['run', 'docs:drift:plugin-registration:manifest:check']); }
try {
  for (const relative of ['package.json', 'scripts/check-plugin-manifest-drift.mjs', 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json', variant.sourceAuthority, ...variant.expectedPages]) {
    const target = path.join(temporary, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, relative), target, { recursive: true });
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'dir');
  {
    const source = path.join(temporary, variant.sourceAuthority);
    const original = fs.readFileSync(source);
    const pages = variant.expectedPages.map(relative => fs.readFileSync(path.join(temporary, relative)));
    const baseline = gate();
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
    console.log(`${variant.id}: checked-in manifest baseline PASS`);
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
        JSON.parse(fs.readFileSync(source, 'utf8')); // The actual gate additionally validates the canonical manifest schema.
        const result = gate();
        assert.equal(result.status, 1, `${id}: expected semantic mismatch, not an input/tool failure`);
        const output = result.stdout + result.stderr;
        assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
        variant.expectedPages.forEach((relative, index) => {
          assert(output.includes(relative), `${id}: missing affected page`);
          assert(fs.readFileSync(path.join(temporary, relative)).equals(pages[index]), `${id}: gate wrote page`);
        });
        console.log(`${id}: rejected by docs:drift:plugin-registration:manifest:check (NOT the full registered family gate); ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
      } finally { fs.writeFileSync(source, original); }
      const restored = gate();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
    // Additional bounded checker controls; not additional pre-registered acceptance mutations.
    for (const [label, mutate] of [
      ['API version', value => { value.apiVersion = 'pipeline-plugin-v9'; }],
      ['invalid empty provider', value => { value.adapters[0].providesCapabilities = []; }],
      ['package version', value => { value.packageVersion = '2.0.0'; }],
      ['module', value => { value.stages[0].module = 'src/adapter.ts'; }],
      ['export', value => { value.stages[0].export = 'executeFull'; }],
      ['schema', value => { value.stages[0].configSchema = 'schemas/input.schema.json'; }],
      ['required capability', value => { value.stages[0].requiredCapabilities.pop(); }],
      ['provided capability', value => { value.adapters[0].providesCapabilities = ['artifacts.write']; }],
    ]) {
      const changed = JSON.parse(original);
      mutate(changed);
      fs.writeFileSync(source, JSON.stringify(changed));
      try {
        const result = gate();
        // The canonical schema rejects unsupported API versions before drift comparison.
        const invalidInput = ['API version', 'invalid empty provider'].includes(label);
        assert.equal(result.status, invalidInput ? 2 : 1, result.stdout + result.stderr);
        assert.equal((result.stdout + result.stderr).includes(family.diagnosticCode), !invalidInput);
      } finally { fs.writeFileSync(source, original); }
      assert.equal(gate().status, 0, `${label}: restoration failed`);
      console.log(`Additional manifest control: ${label} correctly classified; restored baseline PASS`);
    }
    // Syntax errors must not receive a drift code or count as a mutation PASS.
    fs.writeFileSync(source, '{broken');
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'parser control restoration failed');
  }
  console.log('Plugin manifest Add/Change/Remove: 3/3 rejected; restored published baselines PASS; parser errors separate. Extension-class/provider/fixture/report variants NOT qualified; not the full registered registration-family gate or independent A911-11 acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
