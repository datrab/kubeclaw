#!/usr/bin/env node
// Bounded progress-contract variant only; not the full registered contract-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'contract');
const variant = family.variants.find(item => item.id === 'progress-contract');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-progress-contract-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run(process.execPath, ['scripts/docs-product-pipeline-reference.mjs', 'contract']); }
try {
  for (const relative of ['package.json', 'scripts/docs-product-pipeline-reference.mjs', 'skills/nova/project',
    'skills/nova/project_setup/tools', 'skills/common/plugin-runtime/sdk/src/generated/contracts.ts', ...variant.expectedPages]) {
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
    console.log(`${variant.id}: checked-in progress-contract baseline PASS`);
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
        const parsed = ts.createSourceFile(variant.sourceAuthority, fs.readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        assert.equal(parsed.parseDiagnostics.length, 0, `${id}: invalid TypeScript mutation`);
        const result = gate();
        assert.equal(result.status, 1, `${id}: expected semantic mismatch, not an input/tool failure`);
        const output = result.stdout + result.stderr;
        assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
        variant.expectedPages.forEach((relative, index) => {
          assert(output.includes(relative), `${id}: missing affected page`);
          assert(fs.readFileSync(path.join(temporary, relative)).equals(pages[index]), `${id}: gate wrote page`);
        });
        console.log(`${id}: rejected by bounded product-pipeline contract checker (full ${family.gate} not yet implemented); ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
      } finally { fs.writeFileSync(source, original); }
      const restored = gate();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
    // Syntax errors must not receive a drift code or count as a mutation PASS.
    fs.writeFileSync(source, 'export function broken( {');
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'parser control restoration failed');
  }
  console.log('progress-contract Add/Change/Remove: 3/3 rejected; restored published baselines PASS; parser errors separate. SDK export and public member variants remain unqualified; not full contract-family or independent A911-11 acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
