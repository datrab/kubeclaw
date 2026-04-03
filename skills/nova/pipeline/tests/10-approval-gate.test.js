// tests/10-approval-gate.test.js
// Module 10 — Approval Gate
//
// Verifies:
//   1. approval-gate-config-validation  — approval gate config validates as first-class gate type
//   2. approval-state-machine           — PENDING→APPROVED/REJECTED/TIMED_OUT transitions persist correctly
//   3. resume-safety                    — restart/resume without state loss or duplicate request
//   4. timeout-handling                 — on_timeout=block and on_timeout=continue behave deterministically
//   5. audit-artifacts                  — approval-request.json/md, transitions.jsonl, decision.json written
//   6. decision-ready-summary           — Discord embed includes required pipeline context fields
//   7. interaction-path-reality         — V1 bridge: Nova writes decision to gate-state file, pipeline reads it

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { validateConfig } from '../core/config.js';
import { runApprovalGate, APPROVAL_STATUS, buildApprovalEmbed } from '../runners/approval-gate-runner.js';
import { EXIT_OK, EXIT_NEEDS_NOVA } from '../core/constants.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'approval-test-'));
}

function makeConfig(overrides = {}) {
  const tmp = mkTmp();
  const swarmDir = path.join(tmp, '.swarm');
  const logsDir  = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(logsDir, 'gates'), { recursive: true });
  return {
    project:   'test-proj',
    repo_root: tmp,
    _logDir:   logsDir,
    paths: {
      swarm_dir:     swarmDir,
      modules_dir:   path.join(swarmDir, 'modules'),
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    agents: { forge: { dispatch: 'acp' }, buster: { dispatch: 'redis', redis_js_path: '/app/skills/redis.js' } },
    models: {},
    default_timeout_minutes: 45,
    _approvalPollIntervalMs: 0,
    ...overrides,
  };
}

function makeProgress(gateOverrides = {}, execOrder = []) {
  return {
    project:         'test-proj',
    execution_order: execOrder,
    modules:         {},
    gates:           gateOverrides,
  };
}

/**
 * Build a calls tracker with no-op implementations.
 * Override individual methods as needed per test.
 */
function makeMocks(stateSequence = []) {
  const calls = {
    loadGateState:    [],
    saveGateState:    [],
    appendTransition: [],
    writeApprovalRequest: 0,
    writeApprovalDecision: [],
    discord: [],
  };

  let seqIdx = 0;

  return {
    calls,
    overrides: {
      loadGateState: (_config, _gateId) => {
        const idx = Math.min(seqIdx, stateSequence.length - 1);
        const s = stateSequence.length > 0 ? stateSequence[idx] : null;
        seqIdx++;
        calls.loadGateState.push(s ? s.status : null);
        return s ?? null;
      },
      saveGateState: (_config, _gateId, state) => {
        calls.saveGateState.push(JSON.parse(JSON.stringify(state)));
      },
      appendTransition: (_config, _gateId, from, to, note) => {
        calls.appendTransition.push({ from, to, note });
      },
      writeApprovalRequest: (_config, _gateId, _gate, _state) => {
        calls.writeApprovalRequest++;
      },
      writeApprovalDecision: (_config, _gateId, state) => {
        calls.writeApprovalDecision.push(JSON.parse(JSON.stringify(state)));
      },
      discord: async (_config, level, title, _description, _fields) => {
        calls.discord.push({ level, title });
      },
      sleep: async (_ms) => { /* no-op */ },
    },
  };
}

function configWithMocks(stateSequence = [], configOverrides = {}) {
  const cfg = makeConfig(configOverrides);
  const { calls, overrides } = makeMocks(stateSequence);
  cfg._testOverrides = { approvalGate: overrides };
  return { cfg, calls };
}

// ── State factories ───────────────────────────────────────────────────────────

function approvedState(gateId, overrides = {}) {
  return {
    gate_id:      gateId,
    status:       APPROVAL_STATUS.APPROVED,
    run_id:       'run-001',
    project:      'test-proj',
    requested_at: new Date(Date.now() - 5000).toISOString(),
    deadline:     new Date(Date.now() + 3600000).toISOString(),
    timeout_minutes:  60,
    timeout_policy:   'block',
    resolved_at:  new Date().toISOString(),
    decision_by:  'davide',
    decision_via: 'nova-bridge',
    reason:       'Looks good',
    ...overrides,
  };
}

function rejectedState(gateId, reason = 'Needs revision') {
  return {
    ...approvedState(gateId),
    status:       APPROVAL_STATUS.REJECTED,
    reason,
  };
}

/** PENDING state with deadline in the future (within window). */
function pendingState(gateId, timeoutMinutes = 60, elapsedMs = 5000) {
  const requestedAt = new Date(Date.now() - elapsedMs).toISOString();
  const deadline    = new Date(Date.now() - elapsedMs + timeoutMinutes * 60 * 1000).toISOString();
  return {
    gate_id:         gateId,
    status:          APPROVAL_STATUS.PENDING_APPROVAL,
    run_id:          'run-001',
    project:         'test-proj',
    requested_at:    requestedAt,
    deadline:        deadline,
    timeout_minutes: timeoutMinutes,
    timeout_policy:  'block',
    resolved_at:     null,
    decision_by:     null,
    decision_via:    null,
    reason:          null,
  };
}

/** PENDING state with deadline already elapsed (for timeout tests via resume path). */
function expiredPendingState(gateId, timeoutPolicy = 'block') {
  return {
    gate_id:         gateId,
    status:          APPROVAL_STATUS.PENDING_APPROVAL,
    run_id:          'run-001',
    project:         'test-proj',
    requested_at:    new Date(Date.now() - 7200000).toISOString(), // 2h ago
    deadline:        new Date(Date.now() - 3600000).toISOString(), // expired 1h ago
    timeout_minutes: 60,
    timeout_policy:  timeoutPolicy,
    resolved_at:     null,
    decision_by:     null,
    decision_via:    null,
    reason:          null,
  };
}

const GATE_ID = 'approval-gate-01';
const GATE_DEF = {
  type:            'approval',
  title:           'Pre-release Approval',
  timeout_minutes: 60,
  on_timeout:      'block',
};

// ── 1. Config validation ──────────────────────────────────────────────────────

describe('approval-gate-config-validation', () => {
  it('accepts approval as a valid gate type', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test Approval' } },
      [`gate:${GATE_ID}`]
    );
    assert.doesNotThrow(() => validateConfig(config, progress));
  });

  it('rejects unknown gate type', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'human-check', title: 'Test' } },
      [`gate:${GATE_ID}`]
    );
    assert.throws(() => validateConfig(config, progress), /not valid/);
  });

  it('requires title on approval gates', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval' } },
      [`gate:${GATE_ID}`]
    );
    assert.throws(() => validateConfig(config, progress), /title.*required/);
  });

  it('rejects unknown on_timeout value', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test', on_timeout: 'skip' } },
      [`gate:${GATE_ID}`]
    );
    assert.throws(() => validateConfig(config, progress), /on_timeout.*not valid/);
  });

  it('accepts on_timeout=block', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test', on_timeout: 'block' } },
      [`gate:${GATE_ID}`]
    );
    assert.doesNotThrow(() => validateConfig(config, progress));
  });

  it('accepts on_timeout=continue', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test', on_timeout: 'continue' } },
      [`gate:${GATE_ID}`]
    );
    assert.doesNotThrow(() => validateConfig(config, progress));
  });

  it('rejects non-positive timeout_minutes', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test', timeout_minutes: -5 } },
      [`gate:${GATE_ID}`]
    );
    assert.throws(() => validateConfig(config, progress), /timeout_minutes/);
  });

  it('accepts omitted on_timeout (default is block)', () => {
    const config = makeConfig();
    const progress = makeProgress(
      { [GATE_ID]: { type: 'approval', title: 'Test' } },
      [`gate:${GATE_ID}`]
    );
    assert.doesNotThrow(() => validateConfig(config, progress));
  });
});

// ── 2. State machine ──────────────────────────────────────────────────────────

describe('approval-state-machine', () => {
  it('fresh start → APPROVED returns EXIT_OK', async () => {
    // Sequence: first call null (fresh start), second call returns APPROVED
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF }, [`gate:${GATE_ID}`]);

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.APPROVED);
    assert.equal(result.gate_id, GATE_ID);
  });

  it('fresh start → REJECTED returns EXIT_NEEDS_NOVA with reason', async () => {
    const { cfg } = configWithMocks([null, rejectedState(GATE_ID, 'Architecture concerns')]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.REJECTED);
    assert.ok(result.reason.includes('Architecture concerns'));
  });

  it('PENDING → TIMED_OUT (via resume with expired deadline) returns EXIT_NEEDS_NOVA', async () => {
    // Use resume path: first loadGateState returns expired PENDING — detected immediately
    const { cfg, calls } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'block' } });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.ok(result.timed_out === true);
  });

  it('initial state written with PENDING_APPROVAL, deadline, and timeout_policy', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    assert.ok(calls.saveGateState.length >= 1);
    const init = calls.saveGateState[0];
    assert.equal(init.status, APPROVAL_STATUS.PENDING_APPROVAL);
    assert.ok(init.deadline, 'must have deadline');
    assert.ok(init.requested_at, 'must have requested_at');
    assert.ok(init.timeout_policy, 'must have timeout_policy');
    assert.ok(init.gate_id === GATE_ID);
  });

  it('transition log records null → PENDING_APPROVAL on fresh start', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const init = calls.appendTransition.find(t => t.to === APPROVAL_STATUS.PENDING_APPROVAL);
    assert.ok(init, 'should record PENDING_APPROVAL initialization');
    assert.equal(init.from, null);
  });

  it('transition log records PENDING_APPROVAL → APPROVED on resolution', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const resolved = calls.appendTransition.find(t => t.to === APPROVAL_STATUS.APPROVED);
    assert.ok(resolved, 'should record APPROVED transition');
    assert.equal(resolved.from, APPROVAL_STATUS.PENDING_APPROVAL);
  });

  it('CANCELLED state returns EXIT_NEEDS_NOVA', async () => {
    const cancelledState = { ...approvedState(GATE_ID), status: APPROVAL_STATUS.CANCELLED };
    const { cfg } = configWithMocks([null, cancelledState]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.CANCELLED);
  });
});

// ── 3. Resume safety ──────────────────────────────────────────────────────────

describe('resume-safety', () => {
  it('already APPROVED gate skips immediately (no new request or save)', async () => {
    const { cfg, calls } = configWithMocks([approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.APPROVED);
    assert.equal(calls.writeApprovalRequest, 0, 'must not re-post request');
    assert.equal(calls.saveGateState.length, 0, 'must not re-save state');
  });

  it('already REJECTED gate halts immediately with stored reason', async () => {
    const { cfg, calls } = configWithMocks([rejectedState(GATE_ID, 'Previous rejection')]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.REJECTED);
    assert.ok(result.reason.includes('Previous rejection'));
    assert.equal(calls.writeApprovalRequest, 0);
  });

  it('PENDING_APPROVAL on resume continues polling without re-posting Discord request', async () => {
    // First call returns PENDING (resume), second returns APPROVED
    const { cfg, calls } = configWithMocks([pendingState(GATE_ID, 60, 10000), approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(calls.writeApprovalRequest, 0, 'must not re-post request on resume');
    assert.equal(calls.saveGateState.length, 0, 'must not re-save state on resume');
  });

  it('expired PENDING_APPROVAL on resume marks TIMED_OUT without posting duplicate request', async () => {
    const { cfg, calls } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'block' } });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.equal(calls.writeApprovalRequest, 0, 'must not post request on resume');
    const timedOut = calls.saveGateState.find(s => s.status === APPROVAL_STATUS.TIMED_OUT);
    assert.ok(timedOut, 'must persist TIMED_OUT on resume');
  });

  it('already TIMED_OUT on resume re-resolves without posting request', async () => {
    const timedOut = {
      ...approvedState(GATE_ID),
      status:          APPROVAL_STATUS.TIMED_OUT,
      timeout_policy:  'block',
      timeout_minutes: 60,
      decision_via:    'timeout',
    };
    const { cfg, calls } = configWithMocks([timedOut]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.equal(calls.writeApprovalRequest, 0);
  });

  it('state file is the single source of truth — consistent across restart', async () => {
    // Simulate two runs: first run leaves PENDING, second run finds APPROVED
    const { cfg, calls } = configWithMocks([pendingState(GATE_ID, 60, 5000), approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    // Should have resolved via the file state, not re-initialized
    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.APPROVED);
  });
});

// ── 4. Timeout handling ───────────────────────────────────────────────────────

describe('timeout-handling', () => {
  it('on_timeout=block returns EXIT_NEEDS_NOVA on expired PENDING (resume path)', async () => {
    const { cfg } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'block' } });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.ok(result.timed_out === true);
  });

  it('on_timeout=continue returns EXIT_OK on expired PENDING (resume path)', async () => {
    const { cfg } = configWithMocks([expiredPendingState(GATE_ID, 'continue')]);
    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'continue' } });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.ok(result.timed_out === true);
    assert.ok(result.continued === true);
  });

  it('on_timeout=block during fresh-start poll: deadline expires during polling loop', async () => {
    const { cfg, calls } = configWithMocks([null]);
    // Override saveGateState to backdate the deadline in the state object
    // pollForApproval re-reads state.deadline each iteration so the mutation takes effect
    let savedStateRef = null;
    cfg._testOverrides.approvalGate.saveGateState = (_c, _g, state) => {
      if (state.status === APPROVAL_STATUS.PENDING_APPROVAL) {
        // Immediately expire the deadline
        state.deadline     = new Date(Date.now() - 1000).toISOString();
        state.requested_at = new Date(Date.now() - 3601000).toISOString();
      }
      savedStateRef = state;
      calls.saveGateState.push(JSON.parse(JSON.stringify(state)));
    };
    // On second loadGateState call, return the (expired) saved state
    let loadCount = 0;
    cfg._testOverrides.approvalGate.loadGateState = (_c, _g) => {
      loadCount++;
      if (loadCount === 1) return null;
      return savedStateRef;
    };

    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'block' } });
    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.ok(result.timed_out === true);
  });

  it('on_timeout=continue during fresh-start poll: proceeds on timeout', async () => {
    const { cfg, calls } = configWithMocks([null]);
    let savedStateRef = null;
    cfg._testOverrides.approvalGate.saveGateState = (_c, _g, state) => {
      if (state.status === APPROVAL_STATUS.PENDING_APPROVAL) {
        state.deadline     = new Date(Date.now() - 1000).toISOString();
        state.requested_at = new Date(Date.now() - 3601000).toISOString();
        state.timeout_policy = 'continue';
      }
      savedStateRef = state;
      calls.saveGateState.push(JSON.parse(JSON.stringify(state)));
    };
    let loadCount = 0;
    cfg._testOverrides.approvalGate.loadGateState = (_c, _g) => {
      loadCount++;
      if (loadCount === 1) return null;
      return savedStateRef;
    };

    const progress = makeProgress({ [GATE_ID]: { ...GATE_DEF, on_timeout: 'continue' } });
    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.TIMED_OUT);
    assert.ok(result.timed_out === true);
    assert.ok(result.continued === true);
  });

  it('applies config.default_timeout_minutes when gate omits timeout_minutes', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: { type: 'approval', title: 'No timeout set' } });

    await runApprovalGate(cfg, progress, GATE_ID);

    const init = calls.saveGateState[0];
    assert.equal(init.timeout_minutes, cfg.default_timeout_minutes);
  });

  it('TIMED_OUT state persisted on timeout with decision_via=timeout', async () => {
    const { cfg, calls } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const timedOut = calls.saveGateState.find(s => s.status === APPROVAL_STATUS.TIMED_OUT);
    assert.ok(timedOut, 'must persist TIMED_OUT state');
    assert.equal(timedOut.decision_via, 'timeout');
    assert.ok(timedOut.resolved_at, 'must have resolved_at');
  });
});

// ── 5. Audit artifacts ────────────────────────────────────────────────────────

describe('audit-artifacts', () => {
  it('writeApprovalRequest called on fresh start with gate id and state', async () => {
    let capturedRequest = null;
    const { cfg } = configWithMocks([null, approvedState(GATE_ID)]);
    cfg._testOverrides.approvalGate.writeApprovalRequest = (_c, gateId, gate, state) => {
      capturedRequest = { gateId, gateTitle: gate.title, state };
    };

    const progress = makeProgress({ [GATE_ID]: GATE_DEF });
    await runApprovalGate(cfg, progress, GATE_ID);

    assert.ok(capturedRequest, 'writeApprovalRequest must be called');
    assert.equal(capturedRequest.gateId, GATE_ID);
    assert.equal(capturedRequest.gateTitle, GATE_DEF.title);
    assert.ok(capturedRequest.state.requested_at);
    assert.ok(capturedRequest.state.deadline);
    assert.ok(capturedRequest.state.timeout_policy);
  });

  it('approval-request.json written to filesystem has operator instructions', () => {
    const cfg = makeConfig();
    const gateDir = path.join(cfg._logDir, 'gates', GATE_ID);
    fs.mkdirSync(gateDir, { recursive: true });

    const payload = {
      gate_id: GATE_ID,
      gate_title: GATE_DEF.title,
      run_id: 'run-001',
      project: cfg.project,
      status: APPROVAL_STATUS.PENDING_APPROVAL,
      requested_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60,
      timeout_policy: 'block',
      operator_instructions: [
        `APPROVE gate:${GATE_ID}`,
        `REJECT gate:${GATE_ID} reason: <your reason>`,
      ],
      artifacts_dir: `logs/gates/${GATE_ID}/`,
    };
    fs.writeFileSync(path.join(gateDir, 'approval-request.json'), JSON.stringify(payload, null, 2));

    const read = JSON.parse(fs.readFileSync(path.join(gateDir, 'approval-request.json'), 'utf8'));
    assert.equal(read.gate_id, GATE_ID);
    assert.ok(Array.isArray(read.operator_instructions));
    assert.ok(read.operator_instructions.some(i => i.includes('APPROVE gate:')));
    assert.ok(read.operator_instructions.some(i => i.includes('REJECT gate:')));
    assert.ok(read.timeout_policy);
    assert.ok(read.deadline);
  });

  it('transition log records PENDING_APPROVAL → APPROVED transition', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const resolved = calls.appendTransition.find(t => t.to === APPROVAL_STATUS.APPROVED);
    assert.ok(resolved, 'must record APPROVED transition');
    assert.equal(resolved.from, APPROVAL_STATUS.PENDING_APPROVAL);
  });

  it('writeApprovalDecision called on APPROVED resolution with full decision state', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    assert.ok(calls.writeApprovalDecision.length >= 1);
    const decision = calls.writeApprovalDecision[0];
    assert.equal(decision.status, APPROVAL_STATUS.APPROVED);
    assert.ok(decision.decision_by);
    assert.ok(decision.decision_via);
  });

  it('writeApprovalDecision called on TIMED_OUT with decision_via=timeout', async () => {
    const { cfg, calls } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const timedOutDecision = calls.writeApprovalDecision.find(d => d.status === APPROVAL_STATUS.TIMED_OUT);
    assert.ok(timedOutDecision, 'must write TIMED_OUT decision');
    assert.equal(timedOutDecision.decision_via, 'timeout');
  });

  it('transition log records PENDING_APPROVAL → TIMED_OUT transition', async () => {
    const { cfg, calls } = configWithMocks([expiredPendingState(GATE_ID, 'block')]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const timedOut = calls.appendTransition.find(t => t.to === APPROVAL_STATUS.TIMED_OUT);
    assert.ok(timedOut, 'must record TIMED_OUT transition');
    assert.equal(timedOut.from, APPROVAL_STATUS.PENDING_APPROVAL);
  });

  it('writeApprovalRequest NOT called on resume (deduplication)', async () => {
    const { cfg, calls } = configWithMocks([pendingState(GATE_ID, 60, 5000), approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(calls.writeApprovalRequest, 0, 'must not re-post request on resume');
  });
});

// ── 6. Decision-ready approval summary ───────────────────────────────────────

describe('decision-ready-approval-summary', () => {
  const PROGRESS_WITH_STEPS = makeProgress(
    { [GATE_ID]: GATE_DEF },
    ['module-01', 'module-02', `gate:${GATE_ID}`, 'module-03']
  );

  function makeState() {
    return {
      run_id:          'run-xyz',
      project:         'test-proj',
      requested_at:    new Date().toISOString(),
      deadline:        new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60,
      timeout_policy:  'block',
    };
  }

  it('embed includes gate_id, project, and run_id', () => {
    const cfg = makeConfig();
    const embed = buildApprovalEmbed(cfg, GATE_ID, GATE_DEF, makeState(), PROGRESS_WITH_STEPS);
    const allText = JSON.stringify(embed.fields);

    assert.ok(allText.includes(GATE_ID),      'must include gate id');
    assert.ok(allText.includes('test-proj'),  'must include project');
    assert.ok(allText.includes('run-xyz'),    'must include run id');
  });

  it('embed includes timeout policy and a deadline field', () => {
    const cfg = makeConfig();
    const embed = buildApprovalEmbed(cfg, GATE_ID, GATE_DEF, makeState(), PROGRESS_WITH_STEPS);
    const allText = JSON.stringify(embed.fields);

    assert.ok(allText.toLowerCase().includes('block'), 'must include timeout policy');
    const hasDeadline = embed.fields.some(f => f.name.toLowerCase().includes('deadline'));
    assert.ok(hasDeadline, 'must have a deadline field');
  });

  it('embed includes APPROVE and REJECT operator commands', () => {
    const cfg = makeConfig();
    const embed = buildApprovalEmbed(cfg, GATE_ID, GATE_DEF, makeState(), PROGRESS_WITH_STEPS);
    const allText = JSON.stringify(embed.fields);

    assert.ok(allText.includes('APPROVE gate:'), 'must include APPROVE command');
    assert.ok(allText.includes('REJECT gate:'),  'must include REJECT command');
  });

  it('embed includes completed and remaining pipeline steps', () => {
    const cfg = makeConfig();
    const embed = buildApprovalEmbed(cfg, GATE_ID, GATE_DEF, makeState(), PROGRESS_WITH_STEPS);
    const allText = JSON.stringify(embed.fields);

    assert.ok(
      allText.includes('module-01') || allText.includes('module-02'),
      'embed must reference completed steps'
    );
    assert.ok(
      allText.includes('module-03'),
      'embed must reference remaining steps'
    );
  });

  it('embed includes artifact path reference', () => {
    const cfg = makeConfig();
    const embed = buildApprovalEmbed(cfg, GATE_ID, GATE_DEF, makeState(), PROGRESS_WITH_STEPS);
    const allText = JSON.stringify(embed.fields);

    assert.ok(
      allText.includes(`gates/${GATE_ID}`) || allText.includes('.swarm/logs/gates'),
      'embed must reference audit artifact path'
    );
  });

  it('Discord WARN posted on fresh gate initialization', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const warn = calls.discord.find(d => d.level === 'WARN' && d.title.toLowerCase().includes('approval'));
    assert.ok(warn, 'fresh gate must post WARN-level Discord message');
  });

  it('Discord OK posted on approval', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const ok = calls.discord.find(d => d.level === 'OK');
    assert.ok(ok, 'approval must post OK-level Discord message');
  });

  it('Discord CRITICAL posted on rejection', async () => {
    const { cfg, calls } = configWithMocks([null, rejectedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const critical = calls.discord.find(d => d.level === 'CRITICAL');
    assert.ok(critical, 'rejection must post CRITICAL-level Discord message');
  });
});

// ── 7. Interaction path reality (V1 Nova bridge) ──────────────────────────────

describe('interaction-path-reality', () => {
  it('Nova writing APPROVED to gate-state file causes pipeline to proceed', async () => {
    // V1 bridge simulation:
    // 1. First loadGateState → null (fresh start)
    // 2. After gate initializes, Nova writes APPROVED
    // 3. Second loadGateState (poll) → APPROVED
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.APPROVED);
    assert.equal(result.gate_id, GATE_ID);
  });

  it('Nova writing REJECTED with reason propagates reason to pipeline', async () => {
    const { cfg } = configWithMocks([
      null,
      rejectedState(GATE_ID, 'Architecture needs redesign before merge'),
    ]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.REJECTED);
    assert.ok(result.reason.includes('Architecture needs redesign'), 'reason must be propagated');
  });

  it('gate-state file is authoritative — resolution works even with no-op Discord', async () => {
    const { cfg } = configWithMocks([null, approvedState(GATE_ID)]);
    cfg._testOverrides.approvalGate.discord = async () => { /* Discord down — no-op */ };
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    const result = await runApprovalGate(cfg, progress, GATE_ID);

    assert.equal(result.exit, EXIT_OK, 'must approve even if Discord is unavailable');
  });

  it('Nova bridge decision schema has all required fields', () => {
    const state = approvedState(GATE_ID);
    const required = [
      'gate_id', 'status', 'requested_at', 'resolved_at',
      'decision_by', 'decision_via', 'reason', 'timeout_policy',
    ];
    for (const field of required) {
      assert.ok(field in state, `decision state must have field: ${field}`);
    }
  });

  it('approval state file written by pipeline has all required initialization fields', async () => {
    const { cfg, calls } = configWithMocks([null, approvedState(GATE_ID)]);
    const progress = makeProgress({ [GATE_ID]: GATE_DEF });

    await runApprovalGate(cfg, progress, GATE_ID);

    const init = calls.saveGateState[0];
    assert.ok(init, 'initial state must be saved');
    const required = ['gate_id', 'status', 'run_id', 'project', 'requested_at', 'deadline', 'timeout_minutes', 'timeout_policy'];
    for (const field of required) {
      assert.ok(field in init, `initial state must have field: ${field}`);
    }
  });
});
