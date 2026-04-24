import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

export async function registerGovernanceArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
}) {
  await record('approval gate state and audit artifacts preserve canonical gate_type correlation', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-artifacts-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-approval-artifacts',
      telemetry: { enabled: false },
      _runId: 'run-approval-artifacts-1',
      run_id: 'run-approval-artifacts-1',
      _approvalPollIntervalMs: 0,
      _logDir: logDir,
      paths: { swarm_dir: swarmDir },
      _testOverrides: {
        approvalGate: {
          discord: async () => {},
          sleep: async () => {},
        },
      },
    };

    const progress = {
      modules: {},
      gates: {
        'release-approval': {
          type: 'approval',
          title: 'Release Approval',
          timeout_minutes: 0,
          on_timeout: 'block',
        },
      },
      execution_order: ['gate:release-approval'],
    };

    const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');
    assert.equal(result.exit, 10);
    assert.equal(result.status, 'TIMED_OUT');

    const gateState = JSON.parse(fs.readFileSync(path.join(swarmDir, 'release-approval-gate-status.json'), 'utf8'));
    const request = JSON.parse(fs.readFileSync(path.join(logDir, 'gates', 'release-approval', 'approval-request.json'), 'utf8'));
    const decision = JSON.parse(fs.readFileSync(path.join(logDir, 'gates', 'release-approval', 'approval-decision.json'), 'utf8'));
    const requestMarkdown = fs.readFileSync(path.join(logDir, 'gates', 'release-approval', 'approval-request.md'), 'utf8');

    assert.equal(gateState.gate_id, 'release-approval');
    assert.equal(gateState.gate_type, 'approval');
    assert.equal(request.gate_id, 'release-approval');
    assert.equal(request.gate_type, 'approval');
    assert.equal(request.run_id, 'run-approval-artifacts-1');
    assert.equal(decision.gate_id, 'release-approval');
    assert.equal(decision.gate_type, 'approval');
    assert.equal(decision.project, 'behavior-approval-artifacts');
    assert.equal(requestMarkdown.includes('**Gate Type:** approval'), true);
  });

  await record('approval gate transition logs preserve canonical run and gate correlation', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-approval-transitions-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-approval-transitions',
      telemetry: { enabled: false },
      _runId: 'run-approval-transitions-1',
      run_id: 'run-approval-transitions-1',
      _approvalPollIntervalMs: 0,
      _logDir: logDir,
      paths: { swarm_dir: swarmDir },
      _testOverrides: {
        approvalGate: {
          discord: async () => {},
          sleep: async () => {},
        },
      },
    };

    const progress = {
      modules: {},
      gates: {
        'ops-approval': {
          type: 'approval',
          title: 'Ops Approval',
          timeout_minutes: 0,
          on_timeout: 'continue',
        },
      },
      execution_order: ['gate:ops-approval'],
    };

    const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'ops-approval');
    assert.equal(result.exit, 0);
    assert.equal(result.status, 'TIMED_OUT');

    const transitions = fs.readFileSync(path.join(logDir, 'gates', 'ops-approval', 'approval-transitions.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');
    const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline-reference-v10.md'), 'utf8');

    assert.equal(transitions.length, 2);
    assert.equal(transitions[0].run_id, 'run-approval-transitions-1');
    assert.equal(transitions[0].project, 'behavior-approval-transitions');
    assert.equal(transitions[0].gate_id, 'ops-approval');
    assert.equal(transitions[0].gate_type, 'approval');
    assert.equal(transitions[0].to, 'PENDING_APPROVAL');
    assert.equal(transitions[1].run_id, 'run-approval-transitions-1');
    assert.equal(transitions[1].gate_id, 'ops-approval');
    assert.equal(transitions[1].gate_type, 'approval');
    assert.equal(transitions[1].to, 'TIMED_OUT');
    assert.equal(observabilityDoc.includes('Approval-gate artifacts and state carry the same core correlation envelope: `gate_id`, `gate_type`, `run_id`, and `project`.'), true);
    assert.equal(observabilityDoc.includes('Transition entries in `approval-transitions.jsonl` also persist `run_id`, `project`, `gate_id`, and `gate_type` alongside each state change.'), true);
    assert.equal(pipelineReferenceV10.includes('Persistierter Gate-State, `approval-request.json`, und `approval-decision.json` tragen dieselbe Kernkorrelation (`gate_id`, `gate_type`, `run_id`, `project`) wie die zugehörigen Telemetrie- und Discord-Surfaces.'), true);
    assert.equal(pipelineReferenceV10.includes('`approval-transitions.jsonl` persistiert dieselbe Korrelation pro Zustandswechsel (`run_id`, `project`, `gate_id`, `gate_type`, `from`, `to`, `note`).'), true);
  });

  await record('governance summary approval entries preserve canonical approval identity and artifact paths', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
    const summaryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-governance-approval-summary-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-governance-approval-summary',
      telemetry: { enabled: false },
      _runId: 'run-governance-approval-summary-1',
      run_id: 'run-governance-approval-summary-1',
      _approvalPollIntervalMs: 0,
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
      paths: { swarm_dir: swarmDir },
      _testOverrides: {
        approvalGate: {
          discord: async () => {},
          sleep: async () => {},
        },
      },
    };

    const progress = {
      modules: {},
      gates: {
        'release-approval': {
          type: 'approval',
          title: 'Release Approval',
          timeout_minutes: 0,
          on_timeout: 'block',
        },
      },
      execution_order: ['gate:release-approval'],
    };

    const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');
    summaryMod.writeSummary(config, result.exit, result.reason || result.status, null, progress);

    const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'summary.json'), 'utf8'));
    const approvalEntry = summary.governance.approval_gates[0];
    const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');
    const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline-reference-v10.md'), 'utf8');

    assert.equal(approvalEntry.gate_id, 'release-approval');
    assert.equal(approvalEntry.gate_type, 'approval');
    assert.equal(approvalEntry.run_id, 'run-governance-approval-summary-1');
    assert.equal(approvalEntry.project, 'behavior-governance-approval-summary');
    assert.equal(approvalEntry.state_path, '.swarm/release-approval-gate-status.json');
    assert.equal(approvalEntry.request_path, '.swarm/logs/gates/release-approval/approval-request.json');
    assert.equal(approvalEntry.decision_path, '.swarm/logs/gates/release-approval/approval-decision.json');
    assert.equal(approvalEntry.transitions_path, '.swarm/logs/gates/release-approval/approval-transitions.jsonl');
    assert.equal(approvalEntry.artifact_path, '.swarm/logs/gates/release-approval/approval-decision.json');
    assert.equal(observabilityDoc.includes('`summary.json` keeps the same governance correlation: top-level `telemetry_stream_key` plus `.artifacts.*` mirror the same run-scoped replay bundle named in `latest.json`, while `.governance.arch_validator` carries `run_id` and `project`, and `.governance.approval_gates[]` persists `gate_id`, `gate_type`, `run_id`, `project`, plus the approval state/request/decision/transition artifact paths.'), true);
    assert.equal(pipelineReferenceV10.includes('`summary.json` hält dieselbe Governance-Korrelation fest: `.governance.arch_validator` trägt `run_id` und `project`, und `.governance.approval_gates[]` persistiert `gate_id`, `gate_type`, `run_id`, `project` sowie die Pfade zu State-, Request-, Decision- und Transition-Artefakten.'), true);
  });

  await record('governance summary distinguishes auto-continued approval timeouts', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const approvalGateRunnerMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/runners/approval-gate-runner.js');
    const summaryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-governance-approval-timeout-continue-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-governance-approval-timeout-continue',
      telemetry: { enabled: false },
      _runId: 'run-governance-approval-timeout-continue-1',
      run_id: 'run-governance-approval-timeout-continue-1',
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
      paths: { swarm_dir: swarmDir },
      _testOverrides: {
        approvalGate: {
          discord: async () => {},
          sleep: async () => {},
        },
      },
    };

    const progress = {
      modules: {},
      gates: {
        'release-approval': {
          type: 'approval',
          title: 'Release Approval',
          timeout_minutes: 0,
          on_timeout: 'continue',
        },
      },
      execution_order: ['gate:release-approval'],
    };

    const result = await approvalGateRunnerMod.runApprovalGate(config, progress, 'release-approval');
    summaryMod.writeSummary(config, result.exit, result.reason || result.status, null, progress);

    const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'summary.json'), 'utf8'));
    const approvalEntry = summary.governance.approval_gates[0];
    const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');
    const pipelineReferenceV10 = fs.readFileSync(path.join(sourceRoot, 'docs', 'pipeline-reference-v10.md'), 'utf8');

    assert.equal(result.exit, 0);
    assert.equal(result.continued, true);
    assert.equal(summary.governance.overall_outcome, 'CONTINUED_AFTER_APPROVAL_TIMEOUT');
    assert.equal(approvalEntry.status, 'TIMED_OUT');
    assert.equal(approvalEntry.decision_via, 'timeout');
    assert.equal(approvalEntry.timeout_policy, 'CONTINUE');
    assert.equal(approvalEntry.continued, true);
    assert.equal(observabilityDoc.includes('Those same summary approval entries also persist `decision_via`, normalized `timeout_policy`, and `continued`, so offline replay can distinguish a blocking timeout from an auto-continued timeout without reopening the raw gate-state file.'), true);
    assert.equal(observabilityDoc.includes('`summary.json.governance.overall_outcome` now distinguishes `CONTINUED_AFTER_APPROVAL_TIMEOUT` and `CANCELLED_BY_OPERATOR`, so auto-continued approval timeouts and operator cancellations no longer collapse into the same halted or unknown summary state.'), true);
    assert.equal(pipelineReferenceV10.includes('Dieselben Summary-Approval-Einträge persistieren auch `decision_via`, normalisierte `timeout_policy` und `continued`, sodass Offline-Replay einen blockierenden Timeout von einem Auto-Continue-Timeout unterscheiden kann, ohne den rohen Gate-State erneut zu öffnen.'), true);
    assert.equal(pipelineReferenceV10.includes('`summary.json.governance.overall_outcome` unterscheidet jetzt auch `CONTINUED_AFTER_APPROVAL_TIMEOUT` und `CANCELLED_BY_OPERATOR`, sodass Auto-Continue-Timeouts und Operator-Abbrüche nicht mehr in demselben halted- oder unknown-Summary-Zustand landen.'), true);
  });

  await record('governance summary distinguishes operator-cancelled approval gates', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const governanceMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/governance-context.js');
    const summaryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-governance-approval-cancelled-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-governance-approval-cancelled',
      telemetry: { enabled: false },
      _runId: 'run-governance-approval-cancelled-1',
      run_id: 'run-governance-approval-cancelled-1',
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
      paths: { swarm_dir: swarmDir },
    };

    governanceMod.recordApprovalGateOutcome(
      config,
      'ops-approval',
      'Ops Approval',
      'CANCELLED',
      'operator',
      'Superseded by manual rollback',
      {
        gate_type: 'approval',
        run_id: 'run-governance-approval-cancelled-1',
        project: 'behavior-governance-approval-cancelled',
        decision_via: 'operator',
        timeout_policy: 'block',
        continued: false,
      }
    );
    summaryMod.writeSummary(config, 1, 'cancelled', null, { modules: {} });

    const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'summary.json'), 'utf8'));
    const approvalEntry = summary.governance.approval_gates[0];

    assert.equal(summary.governance.overall_outcome, 'CANCELLED_BY_OPERATOR');
    assert.equal(approvalEntry.status, 'CANCELLED');
    assert.equal(approvalEntry.decision_via, 'operator');
    assert.equal(approvalEntry.timeout_policy, 'BLOCK');
    assert.equal(approvalEntry.continued, false);
  });

  await record('governance summary arch-validator entries preserve canonical run correlation', async () => {
    const { runtimeRoot: telemetryRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(telemetryRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const governanceMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/governance-context.js');
    const summaryMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/services/summary.js');
    const runtimeCoreMod = await importRuntimeModule(telemetryRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-governance-arch-summary-'));
    const swarmDir = path.join(root, '.swarm');
    const logDir = path.join(swarmDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const config = {
      project: 'behavior-governance-arch-summary',
      telemetry: { enabled: false },
      _runId: 'run-governance-arch-summary-1',
      run_id: 'run-governance-arch-summary-1',
      _logDir: logDir,
      _runStats: runtimeCoreMod.createRunStats('2026-04-11T00:00:00.000Z'),
      paths: { swarm_dir: swarmDir },
    };

    governanceMod.recordArchValidatorResult(config, {
      blocked: false,
      timestamp: '2026-04-11T00:15:00.000Z',
      findings: [
        { severity: 'warn', code: 'AV-WARN-1' },
        { severity: 'error', code: 'AV-ERR-1' },
      ],
    });
    summaryMod.writeSummary(config, 0, 'ok', null, { modules: {} });

    const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline', 'summary.json'), 'utf8'));
    const archValidator = summary.governance.arch_validator;
    const observabilityDoc = fs.readFileSync(path.join(sourceRoot, 'docs', 'observability-reference.md'), 'utf8');
    const architectureValidatorReference = fs.readFileSync(path.join(sourceRoot, 'docs', 'architecture-validator-reference.md'), 'utf8');

    assert.equal(archValidator.run_id, 'run-governance-arch-summary-1');
    assert.equal(archValidator.project, 'behavior-governance-arch-summary');
    assert.equal(archValidator.outcome, 'PASSED_WITH_FINDINGS');
    assert.equal(archValidator.summary_path, '.swarm/logs/architecture-validator/summary.md');
    assert.equal(observabilityDoc.includes('`summary.json` keeps the same governance correlation: top-level `telemetry_stream_key` plus `.artifacts.*` mirror the same run-scoped replay bundle named in `latest.json`, while `.governance.arch_validator` carries `run_id` and `project`, and `.governance.approval_gates[]` persists `gate_id`, `gate_type`, `run_id`, `project`, plus the approval state/request/decision/transition artifact paths.'), true);
    assert.equal(architectureValidatorReference.includes('The summary entry also preserves `run_id` and `project`, so the governance snapshot can be joined directly back to the same pipeline replay bundle and live telemetry stream.'), true);
  });
}
