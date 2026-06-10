import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { trackAgent, untrackAgent } from '../../../../../skills/nova/pipeline/agents/lifecycle.ts';
import { BudgetExhaustedError } from '../../../../../skills/nova/pipeline/timing.ts';
import { resolveSessionPollIdentity } from '../../../../../skills/nova/pipeline/services/polling-identity.ts';
import { buildSessionPollRateLimitIdentity, pollForSessionEnd, worktreeChangeSignature } from '../../../../../skills/nova/pipeline/services/polling-session-end.ts';

function git(repoRoot, args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function createRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'polling-session-end-'));
  git(repoRoot, ['init', '--quiet']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  git(repoRoot, ['config', 'user.name', 'Test User']);
  return repoRoot;
}

function createBudgetExhaustingAfterThrowCalls(maxThrowCalls) {
  const controller = new AbortController();
  let throwCalls = 0;
  return {
    signal: controller.signal,
    remainingMs: () => 1000,
    throwIfExhausted(reason = 'budget_exhausted') {
      throwCalls += 1;
      if (throwCalls >= maxThrowCalls) {
        throw new BudgetExhaustedError('test budget exhausted', { remainingMs: 0, reason });
      }
    },
  };
}

function createOpenBudget() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    remainingMs: () => 1000,
    throwIfExhausted() {},
  };
}

function activeMonitorState(sessionKey) {
  return {
    sessionKey,
    sessionState: 'running',
    sessionActive: true,
    transcript: {
      offset: 0,
      byteOffset: 0,
      eventCount: 0,
      lastEventTs: null,
      lastActivityPoll: 0,
      hardError: false,
      rateLimited: false,
      terminal: false,
      lastDetail: '',
      partialLine: '',
      newLines: [],
    },
    unknownPolls: 0,
    transcriptStalePolls: 0,
    gatewayUnreachable: false,
    gatewayDetail: null,
    terminal: false,
    rateLimited: false,
    reason: null,
    detail: 'running',
    lastDetail: 'running',
    lastSummary: 'running',
    failed: false,
    sessionTerminal: false,
    stopped: false,
  };
}

function terminalMonitorState(sessionKey, overrides = {}) {
  return {
    ...activeMonitorState(sessionKey),
    sessionState: overrides.sessionState || 'closed',
    sessionActive: false,
    terminal: true,
    reason: overrides.reason || 'closed',
    detail: overrides.detail || 'closed',
    lastDetail: overrides.detail || 'closed',
    lastSummary: overrides.detail || 'closed',
    sessionTerminal: true,
    stopped: true,
    failed: overrides.failed === true,
  };
}

function createPollingConfig(repoRoot, overrides = {}) {
  return {
    repo_root: repoRoot,
    project: 'polling-session-end-test',
    _runId: 'run-polling-session-end',
    poll_interval_seconds: 0.01,
    session_nudge_threshold: 2,
    session_end_grace_ms: 1,
    session_progress_emit_interval_ms: 60000,
    session_progress_log_interval_ms: 60000,
    unknown_poll_limit: 99,
    stale_poll_limit: 99,
    max_transcript_extensions: 0,
    transcript_grace_ms: 0,
    monitor_poll_ms: 10,
    rate_limit: { max_pauses_per_module: 1 },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
    ...overrides,
  };
}

test('tracked gate session identity drives session-end rate-limit scope', () => {
  const telemetryIdentity = resolveSessionPollIdentity({
    tracked: {
      telemetry_module_id: 'module-01',
      telemetry_gate_id: 'gate-review-01',
      telemetry_gate_type: 'review',
      telemetry_attempt: 2,
      telemetry_dispatch_id: 'dispatch-01',
      gatewayLabel: 'Review gate',
      sessionKey: 'session-01',
    },
    explicitModuleId: 'module-fallback',
    sessionLabel: 'review-gate-review-01',
  });
  const rateLimitIdentity = buildSessionPollRateLimitIdentity({
    config: { _runId: 'run-01' },
    telemetryIdentity,
    fallbackModuleId: 'module-fallback',
    sessionLabel: 'review-gate-review-01',
  });

  assert.equal(telemetryIdentity.gate_id, 'gate-review-01');
  assert.equal(telemetryIdentity.gate_type, 'review');
  assert.deepEqual(rateLimitIdentity, {
    run_id: 'run-01',
    module_id: null,
    gate_id: 'gate-review-01',
    gate_type: 'review',
    phase: 'review',
    attempt: 2,
    dispatch_id: 'dispatch-01',
    gateway_label: 'Review gate',
    session_key: 'session-01',
  });
});

test('worktreeChangeSignature detects edits to an already-dirty tracked file', () => {
  const repoRoot = createRepo();
  const filePath = path.join(repoRoot, 'tracked.txt');
  fs.writeFileSync(filePath, 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);

  fs.writeFileSync(filePath, 'dirty baseline\n');
  const baseline = worktreeChangeSignature({ repo_root: repoRoot });

  fs.writeFileSync(filePath, 'dirty baseline\nagent edit\n');
  const changed = worktreeChangeSignature({ repo_root: repoRoot });

  assert.equal(baseline.ok, true);
  assert.equal(changed.ok, true);
  assert.notEqual(changed.signature, baseline.signature);
});

test('pollForSessionEnd timeout preserves late HEAD movement as changes', async () => {
  const repoRoot = createRepo();
  const label = 'forge-timeout-head-move';
  const sessionKey = 'session-timeout-head-move';
  const streamLogPath = path.join(repoRoot, '.swarm', 'logs', 'stream.jsonl');
  const trackedFile = path.join(repoRoot, 'tracked.txt');

  fs.writeFileSync(trackedFile, 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);
  fs.mkdirSync(path.dirname(streamLogPath), { recursive: true });

  const config = {
    repo_root: repoRoot,
    project: 'polling-session-end-test',
    _runId: 'run-timeout-head-move',
    poll_interval_seconds: 0.01,
    session_nudge_threshold: 2,
    session_end_grace_ms: 60000,
    session_progress_emit_interval_ms: 60000,
    session_progress_log_interval_ms: 60000,
    unknown_poll_limit: 99,
    stale_poll_limit: 99,
    max_transcript_extensions: 0,
    transcript_grace_ms: 0,
    monitor_poll_ms: 10,
    rate_limit: { max_pauses_per_module: 1 },
    paths: { swarm_dir: path.join(repoRoot, '.swarm') },
  };
  const budget = createBudgetExhaustingAfterThrowCalls(5);
  let committed = false;

  trackAgent(config, label, sessionKey, 'agent-timeout-head-move', label, streamLogPath, {
    moduleId: 'module-timeout-head-move',
  });
  try {
    const result = await pollForSessionEnd(config, label, 1, 'timeout-head-move-test', {
      budget,
      moduleId: 'module-timeout-head-move',
      getAcpMonitorState: async (childSessionKey) => {
        if (!committed) {
          fs.writeFileSync(trackedFile, 'original\nagent edit\n');
          git(repoRoot, ['add', 'tracked.txt']);
          git(repoRoot, ['commit', '-m', 'agent edit']);
          committed = true;
        }
        return activeMonitorState(childSessionKey);
      },
    });

    assert.equal(committed, true);
    assert.equal(result.completed, false);
    assert.equal(result.hasChanges, true);
    assert.equal(result.reason, 'timeout_with_changes');
  } finally {
    untrackAgent(label);
  }
});

test('pollForSessionEnd completes only after ACP terminal state and reports local changes', async () => {
  const repoRoot = createRepo();
  const label = 'forge-terminal-with-changes';
  const sessionKey = 'session-terminal-with-changes';
  const streamLogPath = path.join(repoRoot, '.swarm', 'logs', 'stream.jsonl');
  const trackedFile = path.join(repoRoot, 'tracked.txt');

  fs.writeFileSync(trackedFile, 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);
  fs.mkdirSync(path.dirname(streamLogPath), { recursive: true });

  const config = createPollingConfig(repoRoot, { _runId: 'run-terminal-with-changes' });
  let edited = false;

  trackAgent(config, label, sessionKey, 'agent-terminal-with-changes', label, streamLogPath, {
    moduleId: 'module-terminal-with-changes',
  });
  try {
    const result = await pollForSessionEnd(config, label, 1, 'terminal-with-changes-test', {
      budget: createOpenBudget(),
      moduleId: 'module-terminal-with-changes',
      getAcpMonitorState: async (childSessionKey) => {
        if (!edited) {
          fs.writeFileSync(trackedFile, 'original\nagent edit\n');
          edited = true;
        }
        return terminalMonitorState(childSessionKey);
      },
    });

    assert.equal(edited, true);
    assert.equal(result.completed, true);
    assert.equal(result.hasChanges, true);
    assert.equal(result.reason, 'session_ended');
  } finally {
    untrackAgent(label);
  }
});

test('pollForSessionEnd completes after ACP terminal state without local changes', async () => {
  const repoRoot = createRepo();
  const label = 'forge-terminal-no-changes';
  const sessionKey = 'session-terminal-no-changes';
  const streamLogPath = path.join(repoRoot, '.swarm', 'logs', 'stream.jsonl');
  const trackedFile = path.join(repoRoot, 'tracked.txt');

  fs.writeFileSync(trackedFile, 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);
  fs.mkdirSync(path.dirname(streamLogPath), { recursive: true });

  const config = createPollingConfig(repoRoot, { _runId: 'run-terminal-no-changes' });

  trackAgent(config, label, sessionKey, 'agent-terminal-no-changes', label, streamLogPath, {
    moduleId: 'module-terminal-no-changes',
  });
  try {
    const result = await pollForSessionEnd(config, label, 1, 'terminal-no-changes-test', {
      budget: createOpenBudget(),
      moduleId: 'module-terminal-no-changes',
      getAcpMonitorState: async (childSessionKey) => terminalMonitorState(childSessionKey),
    });

    assert.equal(result.completed, true);
    assert.equal(result.hasChanges, false);
    assert.equal(result.reason, 'session_closed_no_changes');
  } finally {
    untrackAgent(label);
  }
});

test('pollForSessionEnd fails closed when ACP monitor adapter fails', async () => {
  const repoRoot = createRepo();
  const label = 'forge-monitor-failure';
  const sessionKey = 'session-monitor-failure';
  const streamLogPath = path.join(repoRoot, '.swarm', 'logs', 'stream.jsonl');
  const trackedFile = path.join(repoRoot, 'tracked.txt');

  fs.writeFileSync(trackedFile, 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);
  fs.mkdirSync(path.dirname(streamLogPath), { recursive: true });

  const config = createPollingConfig(repoRoot, { _runId: 'run-monitor-failure' });

  trackAgent(config, label, sessionKey, 'agent-monitor-failure', label, streamLogPath, {
    moduleId: 'module-monitor-failure',
  });
  try {
    const result = await pollForSessionEnd(config, label, 1, 'monitor-failure-test', {
      budget: createOpenBudget(),
      moduleId: 'module-monitor-failure',
      getAcpMonitorState: async () => {
        throw new Error('monitor unavailable');
      },
    });

    assert.equal(result.completed, false);
    assert.equal(result.hasChanges, false);
    assert.equal(result.reason, 'monitor_adapter_failed');
    assert.equal(result.error?.reason, 'acp_monitor_adapter_failed');
  } finally {
    untrackAgent(label);
  }
});

test('worktreeChangeSignature detects edits inside an already-untracked directory', () => {
  const repoRoot = createRepo();
  fs.writeFileSync(path.join(repoRoot, 'tracked.txt'), 'original\n');
  git(repoRoot, ['add', 'tracked.txt']);
  git(repoRoot, ['commit', '-m', 'initial']);

  const untrackedDir = path.join(repoRoot, 'new-dir');
  const untrackedFile = path.join(untrackedDir, 'note.txt');
  fs.mkdirSync(untrackedDir);
  fs.writeFileSync(untrackedFile, 'dirty baseline\n');
  const baseline = worktreeChangeSignature({ repo_root: repoRoot });

  fs.writeFileSync(untrackedFile, 'dirty baseline\nagent edit\n');
  const changed = worktreeChangeSignature({ repo_root: repoRoot });

  assert.equal(baseline.ok, true);
  assert.equal(changed.ok, true);
  assert.notEqual(changed.signature, baseline.signature);
});
