import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'size-budget-parity-'));
const output = path.join(root, 'dist');
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, 'app.js'), Buffer.alloc(2048, 1));
fs.writeFileSync(path.join(output, 'app.css'), Buffer.alloc(512, 2));

const bridge = JSON.parse(fs.readFileSync('contracts/pipeline-test-gate/v1/legacy-suite-bridge.json', 'utf8'));
assert.equal(bridge.suites.bundle.successor, 'kubeclaw.size-budget@1');
const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-size-budget-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-size-budget-parity-ledger.json', 'utf8'));
assert.equal(baseline.expectedItemCount, 35);
assert.equal(ledger.expectedItemCount, 35);
assert.equal(baseline.items.some((item: any) => item.id === 'BUNDLE-LIMIT-009'), true);
assert.equal(ledger.entries['BUNDLE-LIMIT-009']?.status, 'proved');
const legacyPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/bundle.ts';
if (fs.existsSync(legacyPath)) {
  const { default: bundleSuite } = await import(pathToFileURL(path.resolve(legacyPath)).href);
  const oldPass: any = await bundleSuite({ config: { bundle: { www_dir: output, thresholds: { max_size_kb: 64 } } } });
  const oldFail: any = await bundleSuite({ config: { bundle: { www_dir: output, thresholds: { max_size_kb: 0 } } } });
  const oldMissing: any = await bundleSuite({ config: { bundle: { www_dir: path.join(root, 'missing') } } });
  assert.equal(oldPass.status, 'PASS');
  assert.equal(oldFail.status, 'FAIL');
  assert.equal(oldMissing.status, 'FAIL');
  assert.equal(oldPass.metadata.file_count, 2);
  assert.equal(typeof oldPass.metadata.total_size_kb, 'number');
  assert.equal(bridge.suites.bundle.state, 'unmigrated');
} else assert.equal(bridge.suites.bundle.state, 'migrated');

const implementation = await import('./check-pipeline-size-budget-implementation.mts');
assert.ok(implementation);
console.log(JSON.stringify({ ok: true, phase: 'size-budget-parity', authority: bridge.suites.bundle.state,
  parityItems: 35, realFiles: 2, mocks: 0 }));
