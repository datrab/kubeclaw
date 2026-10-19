#!/usr/bin/env node
// Bounded report adapter manifest variant only; NOT the full registered registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'plugin-registration');
const variant = family.variants.find(item => item.id === 'report-format-registration');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-report-registration-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run('npm', ['run', 'docs:drift:plugin-registration:report:check']); }
try {
  for (const relative of ['package.json', 'scripts/check-report-registration-drift.mjs', 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json', variant.sourceAuthority, ...variant.expectedPages]) {
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
        JSON.parse(fs.readFileSync(source, 'utf8')); // Actual gate validates the canonical manifest schema.
        const result = gate();
        assert.equal(result.status, 1, `${id}: expected semantic mismatch, not an input/tool failure`);
        const output = result.stdout + result.stderr;
        assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
        variant.expectedPages.forEach((relative, index) => {
          assert(output.includes(relative), `${id}: missing affected page`);
          assert(fs.readFileSync(path.join(temporary, relative)).equals(pages[index]), `${id}: gate wrote page`);
        });
        console.log(`${id}: rejected by docs:drift:plugin-registration:report:check (NOT the full registered family gate); ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
      } finally { fs.writeFileSync(source, original); }
      const restored = gate();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
    // Additional reader-field directions; not registered acceptance mutations.
    for (const [label, before, after] of [
      ['module', 'src/adapter.js', 'src/replacement.js'],
      ['export', '"export": "adapt"', '"export": "normalize"'],
      ['media type', 'application/junit+xml', 'application/fixture+xml'],
      ['contract version', '"contractVersion": 1', '"contractVersion": 2'],
      ['package version', '"packageVersion": "1.0.0"', '"packageVersion": "2.0.0"'],
    ]) {
      assert.equal(original.toString().split(before).length, 2);
      fs.writeFileSync(source, original.toString().replace(before, after));
      try {
        const result = gate();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert(result.stderr.includes(family.diagnosticCode) && result.stderr.includes(variant.expectedPages[0]));
      } finally { fs.writeFileSync(source, original); }
      assert.equal(gate().status, 0, `${label}: restoration failed`);
    }
    const readerPath = path.join(temporary, variant.expectedPages[0]);
    fs.writeFileSync(readerPath, pages[0].toString().replace('| `junit` | `format` | `junit` |', '| `junit` | `format` | `stale-format` |'));
    try {
      const result = gate();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert(result.stderr.includes(family.diagnosticCode));
    } finally { fs.writeFileSync(readerPath, pages[0]); }
    assert.equal(gate().status, 0, 'reader control restoration failed');
    // Syntax failures must remain tool/input failures, never documentation drift.
    fs.writeFileSync(source, '{broken');
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'parser control restoration failed');
  }
  console.log('Report-registration Add/Change/Remove: 3/3 rejected; restored published baselines PASS; parser errors separate. Full report production/consumption NOT qualified; not the full registered registration-family gate or independent A911-11 acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
