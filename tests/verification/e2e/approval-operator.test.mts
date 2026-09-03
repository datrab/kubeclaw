import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { runApprovalOperator } from './approval-operator.mts';

test('approval operator help does not require state path', () => {
  const output = execFileSync(process.execPath, [path.join(import.meta.dirname, 'approval-operator.mts'), '--help'], { encoding: 'utf8' });
  assert.match(output, /^Usage:/u);
});

test('approval operator rejects non-v2 invocation', async () => {
  const previous = process.env.REAL_E2E_V2_RUNTIME;
  delete process.env.REAL_E2E_V2_RUNTIME;
  try {
    await assert.rejects(
      runApprovalOperator({ statePath: '/unused' }),
      /REAL_E2E_APPROVAL_OPERATOR_REQUIRES_V2_RUNTIME/,
    );
  } finally {
    if (previous === undefined) delete process.env.REAL_E2E_V2_RUNTIME;
    else process.env.REAL_E2E_V2_RUNTIME = previous;
  }
});

test('approval operator resolves the v2 file-backed wait contract', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-approval-v2-'));
  const statePath = path.join(root, 'approval.json');
  fs.writeFileSync(statePath, `${JSON.stringify({
    schema_version: 'operator-approval-state.v2',
    wait_id: 'wait:test',
    gate_id: 'operator-approval',
    status: 'PENDING_APPROVAL',
  })}\n`);
  const previous = process.env.REAL_E2E_V2_RUNTIME;
  process.env.REAL_E2E_V2_RUNTIME = '1';
  try {
    const result = await runApprovalOperator({
      statePath,
      decision: 'approve',
      timeoutMs: 1_000,
      pollMs: 10,
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'APPROVED');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.status, 'APPROVED');
    assert.equal(state.decision_by, 'real-e2e-operator');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.REAL_E2E_V2_RUNTIME;
    else process.env.REAL_E2E_V2_RUNTIME = previous;
  }
});
