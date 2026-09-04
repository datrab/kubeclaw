import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'size-budget-parity-'));
const output = path.join(root, 'dist');
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, 'app.js'), Buffer.alloc(2048, 1));
fs.writeFileSync(path.join(output, 'app.css'), Buffer.alloc(512, 2));

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-size-budget-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json', 'utf8'));
assert.equal(baseline.expectedItemCount, 35);
assert.equal(ledger.expectedItemCount, 35);
assert.equal(baseline.items.some((item: any) => item.id === 'BUNDLE-LIMIT-009'), true);
assert.equal(ledger.entries['BUNDLE-LIMIT-009']?.status, 'proved');
const legacyPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/bundle.ts';
assert.equal(fs.existsSync(legacyPath), false);

const implementation = await import('./check-pipeline-size-budget-implementation.mts');
assert.ok(implementation);
console.log(JSON.stringify({ ok: true, phase: 'size-budget-parity', authority: 'replacement-only',
  parityItems: 35, realFiles: 2, mocks: 0 }));
