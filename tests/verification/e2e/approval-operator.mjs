#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    statePath: '',
    decision: process.env.REAL_E2E_APPROVAL_DECISION || 'approve',
    reason: process.env.REAL_E2E_APPROVAL_REASON || 'Approved by canonical real E2E operator controller.',
    timeoutMs: Number(process.env.REAL_E2E_APPROVAL_OPERATOR_TIMEOUT_MS || 10 * 60 * 1000),
    pollMs: Number(process.env.REAL_E2E_APPROVAL_OPERATOR_POLL_MS || 500),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state-path') {
      args.statePath = argv[++index] || '';
    } else if (arg === '--decision') {
      args.decision = argv[++index] || '';
    } else if (arg === '--reason') {
      args.reason = argv[++index] || '';
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++index]);
    } else if (arg === '--poll-ms') {
      args.pollMs = Number(argv[++index]);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.statePath) throw new Error('--state-path is required');
  if (!['approve', 'deny', 'commentary'].includes(args.decision)) throw new Error('--decision must be approve, deny, or commentary');
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(args.pollMs) || args.pollMs <= 0) throw new Error('--poll-ms must be positive');
  return args;
}

function usage() {
  return 'Usage: node tests/verification/e2e/approval-operator.mjs --state-path <path> [--decision approve|deny|commentary]\n';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.real-e2e-${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function terminalStateFromDecision(state, decision, reason) {
  const resolvedAt = new Date().toISOString();
  if (decision === 'deny') {
    return {
      ...state,
      status: 'REJECTED',
      resolved_at: resolvedAt,
      decision_by: 'real-e2e-operator',
      decision_via: 'real-e2e-auto-deny',
      continued: false,
      reason: reason || 'Denied by canonical real E2E operator controller.',
    };
  }
  return {
    ...state,
    status: 'APPROVED',
    resolved_at: resolvedAt,
    decision_by: 'real-e2e-operator',
    decision_via: decision === 'commentary' ? 'real-e2e-auto-commentary' : 'real-e2e-auto-accept',
    continued: true,
    reason: decision === 'commentary'
      ? (reason || 'Approved with commentary by canonical real E2E operator controller.')
      : (reason || 'Approved by canonical real E2E operator controller.'),
  };
}

export async function runApprovalOperator({ statePath, decision = 'approve', reason = '', timeoutMs = 10 * 60 * 1000, pollMs = 500 } = {}) {
  const startedAt = Date.now();
  let observations = 0;
  process.stdout.write(`${JSON.stringify({ ok: true, phase: 'approval-operator-started', state_path: statePath, decision })}\n`);

  while (Date.now() - startedAt < timeoutMs) {
    observations += 1;
    const state = readJsonIfPresent(statePath);
    if (!state) {
      await delay(pollMs);
      continue;
    }

    const status = String(state.status || '').trim().toUpperCase();
    if (status === 'APPROVED' || status === 'REJECTED' || status === 'TIMED_OUT' || status === 'CANCELLED') {
      return { ok: true, phase: 'approval-operator-existing-terminal', status, observations };
    }
    if (status !== 'PENDING_APPROVAL') {
      return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_UNEXPECTED_STATE', status, observations };
    }

    const next = terminalStateFromDecision(state, decision, reason);
    atomicWriteJson(statePath, next);
    return {
      ok: true,
      phase: 'approval-operator-resolved',
      status: next.status,
      decision_via: next.decision_via,
      observations,
    };
  }

  return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_TIMEOUT', observations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(usage());
      process.exitCode = 0;
    } else {
      const result = await runApprovalOperator(args);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_FAILED', error: error?.message || String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
