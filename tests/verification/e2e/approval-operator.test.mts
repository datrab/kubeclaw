import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';

import { runApprovalOperator } from './approval-operator.mts';
import { approvalDecisionPath, readApprovalDecisionForWait } from './approval-decision-store.mts';

function decisionPathFor(statePath: string, waitId: string): string {
  return approvalDecisionPath(statePath, waitId);
}

test('decision reader ignores terminal values in the mutable discovery file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-approval-store-'));
  const statePath = path.join(root, 'approval.json');
  try {
    fs.writeFileSync(statePath, '{"wait_id":"wait:immutable","status":"APPROVED"}\n');
    assert.equal(readApprovalDecisionForWait(statePath, 'wait:immutable'), null);
    fs.writeFileSync(decisionPathFor(statePath, 'wait:immutable'),
      '{"wait_id":"wait:immutable","status":"REJECTED"}\n');
    assert.equal(readApprovalDecisionForWait(statePath, 'wait:immutable')?.status, 'REJECTED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
    assert.equal(state.status, 'PENDING_APPROVAL');
    const decision = JSON.parse(fs.readFileSync(decisionPathFor(statePath, 'wait:test'), 'utf8'));
    assert.equal(decision.status, 'APPROVED');
    assert.equal(decision.decision_by, 'real-e2e-operator');
    const retried = await runApprovalOperator({ statePath, decision: 'deny', timeoutMs: 1_000, pollMs: 10 });
    assert.equal(retried.phase, 'approval-operator-existing-terminal');
    assert.equal(retried.status, 'APPROVED');
    assert.deepEqual(retried.approval_signal, { stream: 'v2:direct-resume-signal', redis_id: 'wait:test' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.REAL_E2E_V2_RUNTIME;
    else process.env.REAL_E2E_V2_RUNTIME = previous;
  }
});

test('concurrent approval operators publish one immutable terminal decision', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-approval-race-'));
  const statePath = path.join(root, 'approval.json');
  const pending = {
    schema_version: 'operator-approval-state.v2',
    wait_id: 'wait:race',
    gate_id: 'operator-approval',
    status: 'PENDING_APPROVAL',
  };
  fs.writeFileSync(statePath, `${JSON.stringify(pending)}\n`);
  try {
    const run = (decision: 'approve' | 'deny') => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(import.meta.dirname, 'approval-operator.mts'),
        '--state-path', statePath, '--decision', decision, '--poll-ms', '10', '--timeout-ms', '2000'], {
        env: { ...process.env, REAL_E2E_V2_RUNTIME: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = ''; let stderr = '';
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
    const results = await Promise.all([run('approve'), run('deny')]);
    assert.deepEqual(results.map((item) => item.code), [0, 0], results.map((item) => item.stderr).join('\n'));
    assert.equal(results.filter((item) => item.stdout.includes('approval-operator-resolved')).length, 1);
    assert.equal(results.filter((item) => item.stdout.includes('approval-operator-existing-terminal')).length, 1);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).status, 'PENDING_APPROVAL');
    assert.match(JSON.parse(fs.readFileSync(decisionPathFor(statePath, 'wait:race'), 'utf8')).status, /^(?:APPROVED|REJECTED)$/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('approval operator does not replay a decision from an older wait', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-approval-replay-'));
  const statePath = path.join(root, 'approval.json');
  fs.writeFileSync(statePath, `${JSON.stringify({
    schema_version: 'operator-approval-state.v2', wait_id: 'wait:new', gate_id: 'operator-approval', status: 'PENDING_APPROVAL',
  })}\n`);
  fs.writeFileSync(decisionPathFor(statePath, 'wait:old'), `${JSON.stringify({
    wait_id: 'wait:old', gate_id: 'operator-approval', status: 'APPROVED',
  })}\n`);
  const previous = process.env.REAL_E2E_V2_RUNTIME;
  process.env.REAL_E2E_V2_RUNTIME = '1';
  try {
    const result = await runApprovalOperator({ statePath, decision: 'deny', timeoutMs: 1_000, pollMs: 10 });
    assert.equal(result.status, 'REJECTED');
    assert.equal(JSON.parse(fs.readFileSync(decisionPathFor(statePath, 'wait:new'), 'utf8')).status, 'REJECTED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.REAL_E2E_V2_RUNTIME;
    else process.env.REAL_E2E_V2_RUNTIME = previous;
  }
});
