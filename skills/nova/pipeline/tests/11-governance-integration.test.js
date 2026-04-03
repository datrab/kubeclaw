// tests/11-governance-integration.test.js
// Module 11 — Governance Integration and Polish
//
// Verifies that modules 07-10 work coherently as one governed system:
//
//   1. governed-run-scenarios        — approve-path, reject-path, validator-warning
//      behave coherently across modules 07-10
//   2. summary-artifact-coherence   — run summaries expose governance signals clearly
//      with usable artifact references
//   3. operator-message-consistency — governance messages are explicit, consistent,
//      and actionable
//   4. governance-integration-unit  — governance context helpers and integration seams

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  initGovernanceCtx,
  getGovernanceCtx,
  recordArchValidatorResult,
  recordApprovalGateOutcome,
  buildGovernanceSummary,
  buildGovernanceEmbedFields,
} from '../services/governance-context.js';
import { buildApprovalEmbed, APPROVAL_STATUS, runApprovalGate } from '../runners/approval-gate-runner.js';
import { writeSummary } from '../services/summary.js';
import { EXIT_OK, EXIT_NEEDS_NOVA } from '../core/constants.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gov-integration-'));
}

function makeConfig(overrides = {}) {
  const tmp = mkTmp();
  const swarmDir = path.join(tmp, '.swarm');
  const logsDir  = path.join(swarmDir, 'logs');
  fs.mkdirSync(path.join(logsDir, 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(logsDir, 'gates'), { recursive: true });
  fs.mkdirSync(path.join(logsDir, 'cost'), { recursive: true });
  return {
    project:   'test-proj',
    repo_root: tmp,
    _logDir:   logsDir,
    _runId:    'run-test-001',
    paths: {
      swarm_dir:     swarmDir,
      modules_dir:   path.join(swarmDir, 'modules'),
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    agents: { forge: { dispatch: 'acp' }, buster: { dispatch: 'redis' } },
    models: {},
    default_timeout_minutes: 45,
    _approvalPollIntervalMs: 0,
    ...overrides,
  };
}

function makeProgress(gates = {}, modules = {}, execOrder = []) {
  return {
    project:         'test-proj',
    execution_order: execOrder,
    modules,
    gates,
  };
}

function makeArchResult(opts = {}) {
  const {
    blocked = false,
    findings = [],
    timestamp = new Date().toISOString(),
  } = opts;
  return { blocked, findings, timestamp, project: 'test-proj' };
}

function makeMockedApprovalGate(stateSequence = []) {
  const calls = { discord: [], saveGateState: [], appendTransition: [], writeApprovalDecision: [] };
  let idx = 0;
  return {
    calls,
    overrides: {
      loadGateState: () => {
        // Use explicit index — do NOT use ?? since null is a valid "no state" sentinel
        if (stateSequence.length === 0) return null;
        const i = Math.min(idx, stateSequence.length - 1);
        idx++;
        return stateSequence[i];
      },
      saveGateState:        (c, id, s) => { calls.saveGateState.push({ id, status: s.status }); },
      appendTransition:     (c, id, from, to) => { calls.appendTransition.push({ id, from, to }); },
      writeApprovalRequest: () => {},
      writeApprovalDecision: (c, id, s) => { calls.writeApprovalDecision.push({ id, status: s.status }); },
      discord:              (c, level, title, desc, fields) => { calls.discord.push({ level, title }); return Promise.resolve(); },
      sleep:                () => Promise.resolve(),
    },
  };
}

// ── 1. Governance context helpers ─────────────────────────────────────────────

describe('governance-context-helpers', () => {
  it('initGovernanceCtx creates structure on first call', () => {
    const config = makeConfig();
    assert.equal(config._governanceCtx, undefined);
    const ctx = initGovernanceCtx(config);
    assert.ok(ctx);
    assert.equal(ctx.arch_validator, null);
    assert.deepEqual(ctx.approval_gates, []);
  });

  it('initGovernanceCtx is idempotent', () => {
    const config = makeConfig();
    const ctx1 = initGovernanceCtx(config);
    ctx1.arch_validator = { ran: true };
    const ctx2 = initGovernanceCtx(config);
    assert.equal(ctx2.arch_validator.ran, true, 'should return same object, not overwrite');
  });

  it('getGovernanceCtx returns null if not initialized', () => {
    const config = makeConfig();
    assert.equal(getGovernanceCtx(config), null);
  });

  it('getGovernanceCtx returns ctx after init', () => {
    const config = makeConfig();
    initGovernanceCtx(config);
    assert.ok(getGovernanceCtx(config));
  });
});

// ── 2. Arch validator recording ───────────────────────────────────────────────

describe('arch-validator-recording', () => {
  it('PASSED: no findings → outcome=PASSED', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult());
    const av = config._governanceCtx.arch_validator;
    assert.equal(av.ran, true);
    assert.equal(av.blocked, false);
    assert.equal(av.outcome, 'PASSED');
    assert.equal(av.findings_total, 0);
  });

  it('PASSED_WITH_FINDINGS: non-blocking findings → outcome=PASSED_WITH_FINDINGS', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [
        { severity: 'warn',  id: 'W1', explanation: 'missing doc' },
        { severity: 'error', id: 'E1', explanation: 'dep mismatch' },
      ],
    }));
    const av = config._governanceCtx.arch_validator;
    assert.equal(av.outcome, 'PASSED_WITH_FINDINGS');
    assert.equal(av.findings_total, 2);
    assert.equal(av.warn_count, 1);
    assert.equal(av.error_count, 1);
    assert.equal(av.blocking_count, 0);
    assert.equal(av.blocked, false);
  });

  it('BLOCKED: blocking finding → outcome=BLOCKED', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      blocked: true,
      findings: [{ severity: 'blocking', id: 'B1', explanation: 'critical gap' }],
    }));
    const av = config._governanceCtx.arch_validator;
    assert.equal(av.outcome, 'BLOCKED');
    assert.equal(av.blocked, true);
    assert.equal(av.blocking_count, 1);
  });

  it('artifact_path is always set', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult());
    assert.ok(config._governanceCtx.arch_validator.artifact_path);
    assert.match(config._governanceCtx.arch_validator.artifact_path, /results\.json/);
  });
});

// ── 3. Approval gate recording ────────────────────────────────────────────────

describe('approval-gate-recording', () => {
  it('records APPROVED gate correctly', () => {
    const config = makeConfig();
    recordApprovalGateOutcome(config, 'gate-qa', 'QA Gate', APPROVAL_STATUS.APPROVED, 'nova', 'LGTM');
    const gates = config._governanceCtx.approval_gates;
    assert.equal(gates.length, 1);
    assert.equal(gates[0].gate_id, 'gate-qa');
    assert.equal(gates[0].status, APPROVAL_STATUS.APPROVED);
    assert.equal(gates[0].decision_by, 'nova');
    assert.equal(gates[0].reason, 'LGTM');
    assert.ok(gates[0].artifact_path.includes('gate-qa'));
  });

  it('records REJECTED gate with reason', () => {
    const config = makeConfig();
    recordApprovalGateOutcome(config, 'gate-prod', 'Prod Gate', APPROVAL_STATUS.REJECTED, 'davide', 'Tests failed');
    const gate = config._governanceCtx.approval_gates[0];
    assert.equal(gate.status, APPROVAL_STATUS.REJECTED);
    assert.equal(gate.reason, 'Tests failed');
  });

  it('records TIMED_OUT gate', () => {
    const config = makeConfig();
    recordApprovalGateOutcome(config, 'gate-prod', 'Prod Gate', APPROVAL_STATUS.TIMED_OUT, null, 'No response');
    const gate = config._governanceCtx.approval_gates[0];
    assert.equal(gate.status, APPROVAL_STATUS.TIMED_OUT);
    assert.equal(gate.decision_by, null);
  });

  it('accumulates multiple gate outcomes', () => {
    const config = makeConfig();
    recordApprovalGateOutcome(config, 'gate-alpha', 'Alpha', APPROVAL_STATUS.APPROVED, 'nova', null);
    recordApprovalGateOutcome(config, 'gate-beta',  'Beta',  APPROVAL_STATUS.REJECTED, 'davide', 'regression');
    assert.equal(config._governanceCtx.approval_gates.length, 2);
  });
});

// ── 4. Summary artifact coherence ─────────────────────────────────────────────

describe('summary-artifact-coherence', () => {
  it('writeSummary includes governance section in summary.json', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [{ severity: 'warn', id: 'W1', explanation: 'minor issue' }],
    }));
    recordApprovalGateOutcome(config, 'gate-qa', 'QA Gate', APPROVAL_STATUS.APPROVED, 'nova', 'LGTM');

    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summaryPath = path.join(config._logDir, 'pipeline', 'summary.json');
    assert.ok(fs.existsSync(summaryPath), 'summary.json should exist');
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    assert.ok(summary.governance, 'summary must have governance section');
  });

  it('governance section includes arch_validator outcome', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [{ severity: 'warn', id: 'W1', explanation: 'minor' }],
    }));
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    assert.equal(summary.governance.arch_validator.outcome, 'PASSED_WITH_FINDINGS');
    assert.equal(summary.governance.arch_validator.findings_total, 1);
    assert.equal(summary.governance.arch_validator.warn_count, 1);
  });

  it('governance section includes approval_gates list', () => {
    const config = makeConfig();
    recordApprovalGateOutcome(config, 'gate-qa', 'QA Gate', APPROVAL_STATUS.APPROVED, 'nova', 'LGTM');
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    assert.equal(summary.governance.approval_gates.length, 1);
    assert.equal(summary.governance.approval_gates[0].status, APPROVAL_STATUS.APPROVED);
  });

  it('governance section includes usable artifact references', () => {
    const config = makeConfig();
    initGovernanceCtx(config);
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    const artifacts = summary.governance.artifacts;
    assert.ok(artifacts.architecture_validator, 'should reference arch validator artifact');
    assert.ok(artifacts.cost_report, 'should reference cost report');
    assert.ok(artifacts.pipeline_events, 'should reference pipeline events log');
    assert.ok(artifacts.override_policy_log, 'should reference model override policy log');
  });

  it('governance section shows ran=false when arch validator skipped', () => {
    const config = makeConfig();
    initGovernanceCtx(config);
    // Do NOT record arch validator result
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    assert.equal(summary.governance.arch_validator.ran, false);
  });

  it('governance section is present even with no governance context', () => {
    const config = makeConfig();
    // No initGovernanceCtx — governance ctx is null
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');

    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    assert.ok(summary.governance, 'governance key must always be present in summary');
  });
});

// ── 5. Overall governance outcome in summary ──────────────────────────────────

describe('governance-overall-outcome', () => {
  it('CLEAN when arch passes and no gates', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult());
    const gov = buildGovernanceSummary(config);
    assert.equal(gov.overall_outcome, 'CLEAN');
  });

  it('PASSED_WITH_FINDINGS when arch has warnings', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [{ severity: 'warn', id: 'W1' }],
    }));
    const gov = buildGovernanceSummary(config);
    assert.equal(gov.overall_outcome, 'PASSED_WITH_FINDINGS');
  });

  it('BLOCKED_BY_ARCH_VALIDATOR when arch blocks', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      blocked: true,
      findings: [{ severity: 'blocking', id: 'B1' }],
    }));
    const gov = buildGovernanceSummary(config);
    assert.equal(gov.overall_outcome, 'BLOCKED_BY_ARCH_VALIDATOR');
  });

  it('REJECTED_BY_OPERATOR when approval gate is rejected', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult());
    recordApprovalGateOutcome(config, 'gate-qa', 'QA', APPROVAL_STATUS.REJECTED, 'davide', 'regressions');
    const gov = buildGovernanceSummary(config);
    assert.equal(gov.overall_outcome, 'REJECTED_BY_OPERATOR');
  });

  it('HALTED_ON_APPROVAL_TIMEOUT when gate times out with block policy', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult());
    recordApprovalGateOutcome(config, 'gate-qa', 'QA', APPROVAL_STATUS.TIMED_OUT, null, 'No response');
    const gov = buildGovernanceSummary(config);
    assert.equal(gov.overall_outcome, 'HALTED_ON_APPROVAL_TIMEOUT');
  });
});

// ── 6. Governed-run scenarios ─────────────────────────────────────────────────

describe('governed-run-scenarios', () => {
  // Scenario 1: validator passes → approval gate approves → governed flow completes
  it('scenario: arch passes → approval approved → summary reflects governed completion', async () => {
    const config = makeConfig();

    // Step 1: arch validator runs and passes
    recordArchValidatorResult(config, makeArchResult());
    assert.equal(config._governanceCtx.arch_validator.outcome, 'PASSED');

    // Step 2: approval gate runs and gets approved
    const { overrides } = makeMockedApprovalGate([
      null, // loadGateState on init → no existing state
      { status: APPROVAL_STATUS.APPROVED, decision_by: 'nova', decision_via: 'discord', reason: 'LGTM' },
    ]);
    config._testOverrides = { approvalGate: overrides };

    const gate = { title: 'QA Approval', type: 'approval' };
    const progress = makeProgress({ 'gate-qa': gate }, {}, ['mod-01', 'gate:gate-qa', 'mod-02']);
    const result = await runApprovalGate(config, progress, 'gate-qa');

    assert.equal(result.exit, EXIT_OK);
    assert.equal(result.status, APPROVAL_STATUS.APPROVED);

    // Step 3: write summary and verify governance section
    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');
    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));

    assert.equal(summary.governance.arch_validator.outcome, 'PASSED');
    assert.equal(summary.governance.approval_gates.length, 1);
    assert.equal(summary.governance.approval_gates[0].status, APPROVAL_STATUS.APPROVED);
    assert.equal(summary.governance.overall_outcome, 'CLEAN');
  });

  // Scenario 2: validator warns (non-blocking) → run proceeds → summary shows findings
  it('scenario: arch warns (non-blocking) → pipeline proceeds → summary shows PASSED_WITH_FINDINGS', () => {
    const config = makeConfig();

    recordArchValidatorResult(config, makeArchResult({
      blocked: false,
      findings: [
        { severity: 'warn',  id: 'W1', explanation: 'dependency declared twice' },
        { severity: 'error', id: 'E1', explanation: 'test-spec missing required_checks' },
      ],
    }));

    // Pipeline would continue (blocked=false)
    assert.equal(config._governanceCtx.arch_validator.blocked, false);
    assert.equal(config._governanceCtx.arch_validator.outcome, 'PASSED_WITH_FINDINGS');

    writeSummary(config, EXIT_OK, 'PIPELINE_COMPLETE');
    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));

    // Summary must clearly surface the validator findings
    assert.equal(summary.governance.arch_validator.findings_total, 2);
    assert.equal(summary.governance.arch_validator.warn_count, 1);
    assert.equal(summary.governance.arch_validator.error_count, 1);
    assert.equal(summary.governance.arch_validator.blocking_count, 0);
    assert.equal(summary.governance.arch_validator.outcome, 'PASSED_WITH_FINDINGS');
    // Reference to artifacts must be present for operator navigation
    assert.ok(summary.governance.artifacts.architecture_validator);
  });

  // Scenario 3: approval gate rejects → run halts → audit trail in summary
  it('scenario: approval gate rejects → pipeline halts → summary shows REJECTED with audit trail', async () => {
    const config = makeConfig();

    recordArchValidatorResult(config, makeArchResult());

    const { overrides } = makeMockedApprovalGate([
      null, // init → no existing state
      { status: APPROVAL_STATUS.REJECTED, decision_by: 'davide', decision_via: 'discord', reason: 'Regression found in module 07' },
    ]);
    config._testOverrides = { approvalGate: overrides };

    const gate = { title: 'Pre-Deploy Gate', type: 'approval' };
    const progress = makeProgress({ 'gate-prod': gate });
    const result = await runApprovalGate(config, progress, 'gate-prod');

    assert.equal(result.exit, EXIT_NEEDS_NOVA);
    assert.equal(result.status, APPROVAL_STATUS.REJECTED);
    assert.ok(result.reason.includes('Regression found'));

    // Summary must reflect the rejection
    writeSummary(config, EXIT_NEEDS_NOVA, `NEEDS_NOVA:gate:gate-prod`);
    const summary = JSON.parse(fs.readFileSync(
      path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));

    assert.equal(summary.governance.approval_gates.length, 1);
    const gateRecord = summary.governance.approval_gates[0];
    assert.equal(gateRecord.status, APPROVAL_STATUS.REJECTED);
    assert.equal(gateRecord.decision_by, 'davide');
    assert.ok(gateRecord.reason.includes('Regression'));
    assert.ok(gateRecord.artifact_path, 'gate record must reference artifact path for audit');
    assert.equal(summary.governance.overall_outcome, 'REJECTED_BY_OPERATOR');
  });

  // Scenario 4: override policy log path is referenced in governance summary
  it('scenario: override policy log referenced in governance artifacts', () => {
    const config = makeConfig();
    initGovernanceCtx(config);
    const gov = buildGovernanceSummary(config);
    assert.ok(gov.artifacts.override_policy_log, 'override policy log must be referenced');
    assert.match(gov.artifacts.override_policy_log, /model-policy\.jsonl/);
  });
});

// ── 7. Approval embed governance enrichment ───────────────────────────────────

describe('approval-embed-governance-enrichment', () => {
  it('embed includes arch validator field when governance ctx is set', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [{ severity: 'warn', id: 'W1', explanation: 'minor issue' }],
    }));

    const gate = { title: 'QA Gate', type: 'approval' };
    const state = {
      gate_id: 'gate-qa', run_id: 'run-001', project: 'test-proj',
      deadline: new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60, timeout_policy: 'block',
    };
    const progress = makeProgress({ 'gate-qa': gate }, {}, ['gate:gate-qa']);
    const { fields } = buildApprovalEmbed(config, 'gate-qa', gate, state, progress);

    const avField = fields.find(f => f.name === 'Architecture Validator');
    assert.ok(avField, 'approval embed must include Architecture Validator field');
    assert.match(avField.value, /PASSED_WITH_FINDINGS/);
    assert.match(avField.value, /warn/);
  });

  it('embed includes no arch validator field when governance ctx is absent', () => {
    const config = makeConfig();
    // No governance ctx at all

    const gate = { title: 'QA Gate', type: 'approval' };
    const state = {
      gate_id: 'gate-qa', run_id: 'run-001', project: 'test-proj',
      deadline: new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60, timeout_policy: 'block',
    };
    const progress = makeProgress({ 'gate-qa': gate }, {}, ['gate:gate-qa']);
    const { fields } = buildApprovalEmbed(config, 'gate-qa', gate, state, progress);

    const avField = fields.find(f => f.name === 'Architecture Validator');
    assert.equal(avField, undefined, 'should not include arch validator field when ctx absent');
  });

  it('embed includes required operator instruction fields', () => {
    const config = makeConfig();
    const gate = { title: 'Deploy Gate', type: 'approval' };
    const state = {
      gate_id: 'gate-deploy', run_id: 'run-001', project: 'test-proj',
      deadline: new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60, timeout_policy: 'block',
    };
    const progress = makeProgress({ 'gate-deploy': gate });
    const { fields } = buildApprovalEmbed(config, 'gate-deploy', gate, state, progress);

    const approveField = fields.find(f => f.name === 'To Approve');
    const rejectField  = fields.find(f => f.name === 'To Reject');
    assert.ok(approveField, 'embed must include To Approve field');
    assert.ok(rejectField,  'embed must include To Reject field');
    assert.match(approveField.value, /APPROVE gate:gate-deploy/);
    assert.match(rejectField.value,  /REJECT gate:gate-deploy/);
  });

  it('embed includes artifact reference for operator navigation', () => {
    const config = makeConfig();
    const gate = { title: 'Gate', type: 'approval' };
    const state = {
      gate_id: 'gate-x', run_id: 'run-001', project: 'test-proj',
      deadline: new Date(Date.now() + 3600000).toISOString(),
      timeout_minutes: 60, timeout_policy: 'block',
    };
    const progress = makeProgress({ 'gate-x': gate });
    const { fields } = buildApprovalEmbed(config, 'gate-x', gate, state, progress);

    const artifactsField = fields.find(f => f.name === 'Artifacts');
    assert.ok(artifactsField, 'embed must include Artifacts field');
    assert.match(artifactsField.value, /logs\/gates\/gate-x/);
  });
});

// ── 8. Operator message consistency ──────────────────────────────────────────

describe('operator-message-consistency', () => {
  it('REJECTED Discord message includes audit trail reference', async () => {
    const config = makeConfig();
    const discordCalls = [];
    const { overrides } = makeMockedApprovalGate([
      null,
      { status: APPROVAL_STATUS.REJECTED, decision_by: 'davide', decision_via: 'discord', reason: 'Blocked by QA' },
    ]);
    // Override discord to capture calls
    overrides.discord = (c, level, title, desc, fields) => {
      discordCalls.push({ level, title, fields });
      return Promise.resolve();
    };
    config._testOverrides = { approvalGate: overrides };

    const gate = { title: 'Prod Gate', type: 'approval' };
    const progress = makeProgress({ 'gate-prod': gate });
    await runApprovalGate(config, progress, 'gate-prod');

    const rejectedCall = discordCalls.find(c => c.title.includes('Rejected'));
    assert.ok(rejectedCall, 'should post a Rejected Discord message');
    assert.equal(rejectedCall.level, 'CRITICAL');
    const auditField = (rejectedCall.fields || []).find(f => f.name === 'Audit trail');
    assert.ok(auditField, 'rejected message must include Audit trail field');
    assert.match(auditField.value, /gate-prod/);
  });

  it('TIMED_OUT (block) message is CRITICAL and includes audit trail', async () => {
    const config = makeConfig();
    const discordCalls = [];
    // Simulate immediate timeout by setting deadline in the past
    const pastDeadline = new Date(Date.now() - 1000).toISOString();
    const { overrides } = makeMockedApprovalGate([
      {
        status:          APPROVAL_STATUS.PENDING_APPROVAL,
        requested_at:    new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        deadline:        pastDeadline,
        timeout_minutes: 60,
        timeout_policy:  'block',
        run_id:          'run-001', project: 'test-proj', gate_id: 'gate-qa',
      },
    ]);
    overrides.discord = (c, level, title, desc, fields) => {
      discordCalls.push({ level, title, fields });
      return Promise.resolve();
    };
    config._testOverrides = { approvalGate: overrides };

    const gate = { title: 'Timeout Gate', type: 'approval', on_timeout: 'block' };
    const progress = makeProgress({ 'gate-qa': gate });
    await runApprovalGate(config, progress, 'gate-qa');

    const timeoutCall = discordCalls.find(c => c.title.includes('Timeout'));
    assert.ok(timeoutCall, 'should post a Timeout Discord message');
    assert.equal(timeoutCall.level, 'CRITICAL');
    const auditField = (timeoutCall.fields || []).find(f => f.name === 'Audit trail');
    assert.ok(auditField, 'timeout message must include Audit trail field');
  });

  it('TIMED_OUT (continue) message is WARN level', async () => {
    const config = makeConfig();
    const discordCalls = [];
    const pastDeadline = new Date(Date.now() - 1000).toISOString();
    const { overrides } = makeMockedApprovalGate([
      {
        status:          APPROVAL_STATUS.PENDING_APPROVAL,
        requested_at:    new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        deadline:        pastDeadline,
        timeout_minutes: 60,
        timeout_policy:  'continue',
        run_id:          'run-001', project: 'test-proj', gate_id: 'gate-qa',
      },
    ]);
    overrides.discord = (c, level, title, desc, fields) => {
      discordCalls.push({ level, title, fields });
      return Promise.resolve();
    };
    config._testOverrides = { approvalGate: overrides };

    const gate = { title: 'Auto Gate', type: 'approval', on_timeout: 'continue' };
    const progress = makeProgress({ 'gate-qa': gate });
    const result = await runApprovalGate(config, progress, 'gate-qa');

    assert.equal(result.exit, EXIT_OK);
    const timeoutCall = discordCalls.find(c => c.title.includes('Timeout'));
    assert.ok(timeoutCall);
    assert.equal(timeoutCall.level, 'WARN', 'auto-continue timeout should be WARN, not CRITICAL');
  });
});

// ── 9. Governance embed fields helper ─────────────────────────────────────────

describe('buildGovernanceEmbedFields', () => {
  it('returns empty array when no governance ctx', () => {
    const config = makeConfig();
    const fields = buildGovernanceEmbedFields(config);
    assert.deepEqual(fields, []);
  });

  it('returns arch validator field when ctx has arch result', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      blocked: true,
      findings: [{ severity: 'blocking', id: 'B1' }],
    }));
    const fields = buildGovernanceEmbedFields(config);
    const avField = fields.find(f => f.name === 'Architecture Validator');
    assert.ok(avField);
    assert.match(avField.value, /BLOCKED/);
  });

  it('includes finding count breakdown in arch validator field', () => {
    const config = makeConfig();
    recordArchValidatorResult(config, makeArchResult({
      findings: [
        { severity: 'blocking', id: 'B1' },
        { severity: 'error', id: 'E1' },
        { severity: 'warn', id: 'W1' },
      ],
    }));
    const fields = buildGovernanceEmbedFields(config);
    const avField = fields.find(f => f.name === 'Architecture Validator');
    assert.ok(avField);
    assert.match(avField.value, /blocking/);
  });
});
