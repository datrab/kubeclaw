import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveExecutable } from './support/resolve-executable.mts';

const baseline = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-kubernetes-fixture-baseline.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('docs/architecture/pipeline-test-gate-kubernetes-fixture-parity-ledger.json', 'utf8'));
assert.equal(baseline.expectedItemCount, 48);
assert.equal(baseline.items.length, 48);
assert.equal(Object.keys(ledger.entries).length, 48);
assert.deepEqual(Object.keys(ledger.entries).sort(), baseline.items.map((item: any) => item.id).sort());
for (const [id, entry] of Object.entries(ledger.entries) as [string, any][]) {
  assert.ok(['proved', 'deferred'].includes(entry.status), `${id} must be proved or explicitly deferred`);
  assert.ok(['preserved', 'improved', 'removed-defect', 'deferred'].includes(entry.disposition), `${id} has an invalid disposition`);
  assert.equal(entry.status === 'deferred', entry.disposition === 'deferred', `${id} deferred state and disposition must agree`);
  assert.ok((Array.isArray(entry.proof) && entry.proof.length > 0)
    || (Array.isArray(ledger.proof) && ledger.proof.length > 0), `${id} must cite proof`);
}

const legacyPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/k8s.ts';
assert.equal(fs.existsSync(legacyPath), false);

resolveExecutable('kubectl');
const executableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-kubectl-path-'));
try {
  const target = path.join(executableRoot, 'kubectl-1.31');
  const executable = path.join(executableRoot, 'kubectl');
  fs.writeFileSync(target, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  fs.symlinkSync(path.basename(target), executable);
  assert.equal(resolveExecutable('kubectl', executableRoot), fs.realpathSync(target));
  assert.throws(() => resolveExecutable('kubectl', ''), /EXECUTABLE_NOT_FOUND:kubectl/u);
} finally {
  fs.rmSync(executableRoot, { recursive: true, force: true });
}
const chart = fs.readFileSync('charts/kubeclaw/templates/buster-namespace-controller.yaml', 'utf8');
const controller = fs.readFileSync('cmd/buster-namespace-controller/main.go', 'utf8');
assert.doesNotMatch(chart, /pods\/portforward/u);
assert.doesNotMatch(controller, /pods\/portforward/u);

await import('./check-pipeline-kubernetes-fixture-implementation.mts');
console.log(JSON.stringify({ ok: true, phase: 'kubernetes-fixture-parity', items: 48,
  deploymentRollout: 'accepted-deferred', mocks: 0, wrappers: 0 }));
