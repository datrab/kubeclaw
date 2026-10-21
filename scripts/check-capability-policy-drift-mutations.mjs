#!/usr/bin/env node
// Bounded example-policy variant only; NOT the full registered capability-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === 'capability');
const variant = family.variants.find(item => item.id === 'role-grant');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-capability-policy-drift-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function gate() { return run('npm', ['run', 'docs:drift:capability:policy:check']); }
try {
  for (const relative of ['package.json', 'scripts/check-capability-policy-drift.mjs', 'skills/common/plugin-runtime/foundation/config/platform.ts', 'skills/common/plugin-runtime/foundation/config/platform.schema.json', variant.sourceAuthority, ...variant.expectedPages]) {
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
    console.log(`${variant.id}: checked-in example-policy baseline PASS`);
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
        const parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
        const originalPolicy = JSON.parse(original);
        const constraints = parsed.grants['kubeclaw.human-approval:approval']['operator.request'];
        if (operation === 'add') assert.deepEqual(constraints, { allowedTargets: ['operators', 'fixture-operators'] });
        else if (operation === 'change') assert.deepEqual(constraints, { allowedTargets: ['fixture-operators'] });
        else assert.equal(constraints, undefined);
        assert.deepEqual(parsed.providers, originalPolicy.providers);
        // Gate status 1 requires successful real platform-schema loading, not invalid input.

        const result = gate();
        assert.equal(result.status, 1, `${id}: expected semantic mismatch, not an input/tool failure`);
        const output = result.stdout + result.stderr;
        assert(output.includes(family.diagnosticCode), `${id}: unrelated failure: ${output}`);
        variant.expectedPages.forEach((relative, index) => {
          assert(output.includes(relative), `${id}: missing affected page`);
          assert(fs.readFileSync(path.join(temporary, relative)).equals(pages[index]), `${id}: gate wrote page`);
        });
        console.log(`${id}: rejected by docs:drift:capability:policy:check (NOT the full registered family gate); ${family.diagnosticCode}; ${variant.expectedPages.join(', ')}`);
      } finally { fs.writeFileSync(source, original); }
      const restored = gate();
      assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    }
    // Syntax errors must not receive a drift code or count as a mutation PASS.
    fs.writeFileSync(source, '{ broken');
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'parser control restoration failed');
    // Valid JSON with an invalid platform shape must also remain a tool/input error.
    fs.writeFileSync(source, JSON.stringify({ ...JSON.parse(original), roles: {} }));
    try {
      const invalid = gate();
      assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
      assert(invalid.stderr.includes('PLATFORM_CONFIG_INVALID'), invalid.stderr);
      assert(!invalid.stderr.includes(family.diagnosticCode), invalid.stderr);
    } finally { fs.writeFileSync(source, original); }
    assert.equal(gate().status, 0, 'schema control restoration failed');
  }
  console.log('Example-policy Add/Change/Remove: 3/3 rejected; target-scope addition/replacement and requested-grant removal; real platform schema accepted each mutation, checked-in/restored baselines PASS; malformed JSON separate. NOT installed-registry/deployment success, complete capability-family gate or independent A911-11 acceptance.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
