#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface ApprovalState {
  readonly wait_id?: string;
  readonly gate_id?: string;
  readonly status?: string;
  readonly [key: string]: unknown;
}

interface ApprovalOperatorOptions {
  readonly statePath: string;
  readonly decision?: 'approve' | 'deny' | 'commentary';
  readonly reason?: string;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

interface ParsedApprovalOperatorArgs {
  statePath: string;
  decision: 'approve' | 'deny' | 'commentary';
  reason: string;
  timeoutMs: number;
  pollMs: number;
  help?: boolean;
}

function parseDecision(value: string | undefined): ParsedApprovalOperatorArgs['decision'] {
  const decision = value || 'approve';
  if (!['approve', 'deny', 'commentary'].includes(decision)) {
    throw new Error('--decision must be approve, deny, or commentary');
  }
  return decision as ParsedApprovalOperatorArgs['decision'];
}

function parseArgs(argv: readonly string[]): ParsedApprovalOperatorArgs {
  const args: ParsedApprovalOperatorArgs = {
    statePath: '',
    decision: parseDecision(process.env.REAL_E2E_APPROVAL_DECISION),
    reason: process.env.REAL_E2E_APPROVAL_REASON || 'Approved by canonical real E2E operator controller.',
    timeoutMs: Number(process.env.REAL_E2E_APPROVAL_OPERATOR_TIMEOUT_MS || 10 * 60 * 1000),
    pollMs: Number(process.env.REAL_E2E_APPROVAL_OPERATOR_POLL_MS || 500),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state-path') {
      args.statePath = argv[++index] || '';
    } else if (arg === '--decision') {
      args.decision = parseDecision(argv[++index]);
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
  if (args.help) return args;
  if (!args.statePath) throw new Error('--state-path is required');
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(args.pollMs) || args.pollMs <= 0) throw new Error('--poll-ms must be positive');
  return args;
}

function usage(): string {
  return 'Usage: node tests/verification/e2e/approval-operator.mts --state-path <path> [--decision approve|deny|commentary]\n';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonIfPresent(filePath: string): ApprovalState | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ApprovalState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function decisionPathFor(statePath: string, waitId: string): string {
  const identity = crypto.createHash('sha256').update(waitId).digest('hex');
  return `${statePath}.decision-${identity}.json`;
}

function atomicCreateJson(filePath: string, value: ApprovalState): boolean {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    try {
      fs.linkSync(tmpPath, filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

function terminalStateFromDecision(
  state: ApprovalState,
  decision: 'approve' | 'deny' | 'commentary',
  reason: string,
): ApprovalState {
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

async function publishApprovalSignal({ state }: { readonly state: ApprovalState }) {
  return {
    stream: 'v2:direct-resume-signal',
    id: state.wait_id || `approval:${state.gate_id || 'operator-approval'}`,
  };
}

export async function runApprovalOperator({
  statePath,
  decision = 'approve',
  reason = '',
  timeoutMs = 10 * 60 * 1000,
  pollMs = 500,
}: ApprovalOperatorOptions) {
  if (process.env.REAL_E2E_V2_RUNTIME !== '1') {
    throw new Error('REAL_E2E_APPROVAL_OPERATOR_REQUIRES_V2_RUNTIME');
  }
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
    const stateStatus = String(state.status ?? '').trim().toUpperCase();
    if (stateStatus === 'APPROVED' || stateStatus === 'REJECTED' || stateStatus === 'TIMED_OUT' || stateStatus === 'CANCELLED') {
      return { ok: true, phase: 'approval-operator-existing-terminal', status: stateStatus, observations };
    }
    if (stateStatus !== 'PENDING_APPROVAL') {
      return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_UNEXPECTED_STATE', status: stateStatus, observations };
    }
    if (typeof state.wait_id !== 'string' || state.wait_id.length === 0) {
      return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_WAIT_ID_MISSING', observations };
    }

    const decisionPath = decisionPathFor(statePath, state.wait_id);
    const existingDecision = readJsonIfPresent(decisionPath);
    if (existingDecision) {
      const status = String(existingDecision.status ?? '').trim().toUpperCase();
      if (existingDecision.wait_id !== state.wait_id || existingDecision.gate_id !== state.gate_id) {
        return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_DECISION_IDENTITY_MISMATCH', status, observations };
      }
      if (status === 'APPROVED' || status === 'REJECTED' || status === 'TIMED_OUT' || status === 'CANCELLED') {
        return { ok: true, phase: 'approval-operator-existing-terminal', status, observations };
      }
      return { ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_UNEXPECTED_DECISION', status, observations };
    }

    const next = terminalStateFromDecision(state, decision, reason);
    if (!atomicCreateJson(decisionPath, next)) continue;
    const published = await publishApprovalSignal({ state: next });
    return {
      ok: true,
      phase: 'approval-operator-resolved',
      status: next.status,
      decision_via: next.decision_via,
      approval_signal: {
        stream: published.stream,
        redis_id: published.id,
      },
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
    process.stderr.write(`${JSON.stringify({ ok: false, reason: 'REAL_E2E_APPROVAL_OPERATOR_FAILED', error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
