#!/usr/bin/env node
// Bounded E2E requirement-policy record variant only; NOT the full registered registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'plugin-registration');
const variant = family.variants.find(item => item.id === 'fixture-registration');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-fixture-registration-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run('npm', ['run', 'docs:drift:plugin-registration:fixture:check']); }
try {
  for (const relative of ['package.json', 'scripts/check-fixture-registration-drift.mjs', variant.sourceAuthority, ...variant.expectedPages]) {
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
    console.log(`${variant.id}: checked-in coverage baseline PASS`);
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
        assert.equal(ts.createSourceFile(source, fs.readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS).parseDiagnostics.length, 0);
        const result = gate();
        assert.equal(result.status, 1, `${id}: expected semantic mismatch, not an input/tool failure`);
        const output = result.stdout + result.stderr;
        assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
        variant.expectedPages.forEach((relative, index) => {
          assert(output.includes(relative), `${id}: missing affected page`);
          assert(fs.readFileSync(path.join(temporary, relative)).equals(pages[index]), `${id}: gate wrote page`);
        });
        console.log(`${id}: rejected by docs:drift:plugin-registration:fixture:check (NOT the full registered family gate); ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
      } finally { fs.writeFileSync(source, original); }
      const restored = gate();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
    // Additional directions: stale reader contract and changed field expressions.
    for (const [label, before, after] of [
      ['module statement', 'Nginx listens on 8080', 'Nginx listens on 8081'],
      ['module identity', "  '01-nginx':", "  '05-nginx':"],
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
    fs.writeFileSync(readerPath, pages[0].toString().replace('| `moduleRequirements` | `01-nginx` |', '| `moduleRequirements` | `stale-module` |'));
    try {
      const result = gate();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert(result.stderr.includes(family.diagnosticCode));
    } finally { fs.writeFileSync(readerPath, pages[0]); }
    assert.equal(gate().status, 0, 'reader control restoration failed');
    // Syntax failures must remain tool/input failures, never documentation drift.
    fs.writeFileSync(source, 'export function broken( {');
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'parser control restoration failed');
  }
  console.log('Fixture-registration Add/Change/Remove: 3/3 rejected; restored published baselines PASS; parser errors separate. Report variant and full coverage assembly NOT qualified; not the full registered registration-family gate or independent A911-11 acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
