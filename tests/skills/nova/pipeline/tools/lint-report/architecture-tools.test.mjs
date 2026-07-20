import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalCycle,
  dependencyCruiserFindings,
  jscpdFindings,
  knipFindings,
} from '../../../../../../skills/nova/pipeline/tools/lint-report/architecture-tools.ts';

test('directed cycles have one stable rotation-independent identity', () => {
  assert.deepEqual(canonicalCycle(['b.ts', 'c.ts', 'a.ts', 'b.ts']), ['a.ts', 'b.ts', 'c.ts']);
  assert.deepEqual(canonicalCycle(['c.ts', 'a.ts', 'b.ts', 'c.ts']), ['a.ts', 'b.ts', 'c.ts']);
});

test('dependency cruiser enforces boundaries and deduplicates cycles', () => {
  const ctx = {
    policy: {
      architecture: {
        layers: [
          { id: 'domain', roots: ['src/domain'], may_depend_on: ['domain'] },
          { id: 'delivery', roots: ['src/delivery'], may_depend_on: ['delivery', 'domain'] },
        ],
      },
    },
  };
  const modules = [
    {
      source: 'src/domain/a.ts',
      dependencies: [
        { resolved: 'src/delivery/b.ts', circular: false },
        { resolved: 'src/domain/c.ts', circular: true, cycle: [{ name: 'src/domain/c.ts' }, { name: 'src/domain/a.ts' }] },
      ],
    },
    {
      source: 'src/domain/c.ts',
      dependencies: [{ resolved: 'src/domain/a.ts', circular: true, cycle: [{ name: 'src/domain/a.ts' }, { name: 'src/domain/c.ts' }] }],
    },
  ];

  const findings = dependencyCruiserFindings(ctx, modules);
  assert.equal(findings.filter(finding => finding.code === 'architecture:forbidden-dependency').length, 1);
  assert.equal(findings.filter(finding => finding.code === 'architecture:circular-dependency').length, 1);
});

test('dependency cruiser assigns nested roots to the most specific matching layer', () => {
  const ctx = {
    policy: {
      architecture: {
        layers: [
          { id: 'broad', roots: ['src', 'unrelated/very/long/root'], may_depend_on: ['broad'] },
          { id: 'specific', roots: ['src/specific'], may_depend_on: ['specific'] },
        ],
      },
    },
  };
  const findings = dependencyCruiserFindings(ctx, [{
    source: 'src/specific/a.ts',
    dependencies: [{ resolved: 'src/general.ts', circular: false }],
  }]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'architecture:forbidden-dependency');
  assert.match(findings[0].message, /^specific may not depend on broad:/);
});

test('knip normalization distinguishes dead code and undeclared dependencies', () => {
  const findings = knipFindings({
    issues: [{
      file: 'src/a.ts',
      files: [{ name: 'src/dead.ts' }],
      exports: [{ name: 'unused', line: 4, col: 2 }],
      unlisted: [{ name: 'missing-package', line: 1, col: 1 }],
    }],
  });
  assert.deepEqual(findings.map(finding => finding.code), ['knip:files', 'knip:exports', 'knip:unlisted']);
  assert.ok(findings.every(finding => finding.severity === 'error'));
});

test('jscpd clone fingerprints exclude unstable line coordinates', () => {
  const clone = {
    format: 'typescript', lines: 12, tokens: 80, fragment: 'const value = 1;',
    firstFile: { name: 'src/a.ts', start: 10 },
    secondFile: { name: 'src/b.ts', start: 20 },
  };
  const first = jscpdFindings({ duplicates: [clone] })[0];
  const moved = jscpdFindings({ duplicates: [{ ...clone, firstFile: { ...clone.firstFile, start: 100 } }] })[0];
  assert.deepEqual(first.fingerprint_seed, moved.fingerprint_seed);
});
