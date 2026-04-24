// runners/approval-gate-runner.js — Human-in-the-loop approval gate
//
// Pauses pipeline execution at defined decision points until an operator
// explicitly approves, rejects, or the configured timeout elapses.
//
// V1 interaction model:
//   Pipeline posts a structured Discord embed via existing webhook.
//   Operator responds via OpenClaw/Nova with explicit commands:
//     APPROVE gate:<id>
//     REJECT gate:<id> reason: <reason>
//   Nova writes the decision directly to the authoritative gate-state file.
//   Pipeline resumes by reading that file — Discord is the UI, not the source of truth.
//
// Authoritative state:  .swarm/<gate-id>-gate-status.json
// Audit artifacts:      .swarm/logs/gates/<gate-id>/
//   approval-request.json       — normalized request payload
//   approval-request.md         — operator-facing summary
//   approval-transitions.jsonl  — append-only transition log
//   approval-decision.json      — final resolved decision record

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA } from '../core/constants.js';
import { gateStatusPath, gateLogDir } from '../core/paths.js';
import { discord as discordIntegration } from '../integrations/discord.js';
import { syncApprovalWaitState } from '../services/status-store.js';
import { buildDiscordIdentityFields, DISCORD_FIELD_SPECS } from '../services/discord-fields.js';
import { recordApprovalGateOutcome, buildGovernanceEmbedFields } from '../services/governance-context.js';
import { onApprovalRequested, onApprovalResolved, onGateStarted, onGatePass, onGateFail } from '../services/telemetry.js';
import {
  buildTypedGateControlResult,
  cloneSerializable,
  coerceTypedGateControlResult,
  extractTypedGateLegacyResult,
  isTypedGateControlResult,
} from '../services/gate-control-result.js';

// ─── Approval state constants ─────────────────────────────────────────────────

export const APPROVAL_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  TIMED_OUT:        'TIMED_OUT',
  CANCELLED:        'CANCELLED',
};

export const APPROVAL_TIMEOUT_POLICY = {
  BLOCK: 'BLOCK',
  CONTINUE: 'CONTINUE',
};

const DEFAULT_TIMEOUT_MINUTES = 60;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export function normalizeApprovalTimeoutPolicy(value, fallback = APPROVAL_TIMEOUT_POLICY.BLOCK) {
  const fallbackPolicy = typeof fallback === 'string' && fallback
    ? String(fallback).trim().toUpperCase()
    : APPROVAL_TIMEOUT_POLICY.BLOCK;
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === APPROVAL_TIMEOUT_POLICY.BLOCK || normalized === APPROVAL_TIMEOUT_POLICY.CONTINUE) {
    return normalized;
  }
  return fallbackPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE
    ? APPROVAL_TIMEOUT_POLICY.CONTINUE
    : APPROVAL_TIMEOUT_POLICY.BLOCK;
}

function isApprovalTimeoutContinue(value) {
  return normalizeApprovalTimeoutPolicy(value) === APPROVAL_TIMEOUT_POLICY.CONTINUE;
}

function normalizeApprovalGateState(state, identity = {}) {
  if (!state || typeof state !== 'object') return state;
  const normalizedGateId = state.gate_id || identity.gate_id || identity.gateId || null;
  const normalizedGateType = state.gate_type || identity.gate_type || identity.gateType || null;
  const normalizedProject = state.project || identity.project || null;
  const timeoutPolicy = normalizeApprovalTimeoutPolicy(state.timeout_policy);
  let next = state;

  if (state.timeout_policy !== timeoutPolicy) next = { ...next, timeout_policy: timeoutPolicy };
  if (normalizedGateId && state.gate_id !== normalizedGateId) next = next === state ? { ...next, gate_id: normalizedGateId } : { ...next, gate_id: normalizedGateId };
  if (normalizedGateType && state.gate_type !== normalizedGateType) next = next === state ? { ...next, gate_type: normalizedGateType } : { ...next, gate_type: normalizedGateType };
  if (normalizedProject && state.project !== normalizedProject) next = next === state ? { ...next, project: normalizedProject } : { ...next, project: normalizedProject };

  return next;
}

function buildApprovalIdentity(config, gateId, gate = null, state = null) {
  return {
    run_id: state?.run_id || config._runId || config.run_id || null,
    project: state?.project || config.project || null,
    gate_id: state?.gate_id || gateId || null,
    gate_type: state?.gate_type || gate?.type || 'approval',
  };
}

function buildApprovalGateDiscordFields(identity = {}, extra = []) {
  return buildDiscordIdentityFields(identity, [
    DISCORD_FIELD_SPECS.RUN_ID,
    DISCORD_FIELD_SPECS.GATE_ID,
    DISCORD_FIELD_SPECS.GATE_TYPE,
  ], extra);
}

function emitApprovalGateVerdict(config, gateId, gate, verdict, reason = null, options = {}) {
  const payload = {
    gate_type: gate?.type || 'approval',
    duration_seconds: null,
    reason,
    presentation: options.presentation || {},
  };

  if (verdict === 'GO') onGatePass({ config }, gateId, payload);
  else onGateFail({ config }, gateId, payload);
}

function replayResolvedApprovalTelemetry(config, gateId, gate, state, { verdict, fallbackReason = null } = {}) {
  const resolutionStatus = (state?.status || '').toUpperCase() || null;
  const resolvedBy = state?.decision_by || null;
  const reason = state?.reason || fallbackReason;

  recordApprovalGateOutcome(config, gateId, gate?.title, resolutionStatus, resolvedBy, reason, {
    gate_type: gate?.type || 'approval',
    run_id: state?.run_id || config._runId || config.run_id || null,
    project: config.project || null,
    decision_via: state?.decision_via || null,
    timeout_policy: state?.timeout_policy || null,
    continued: state?.continued,
  });
  onApprovalResolved({ config }, gateId, resolutionStatus, resolvedBy, { gate_type: gate?.type || 'approval' });
  emitApprovalGateVerdict(config, gateId, gate, verdict, reason);
}

function mapApprovalLegacyExitToControl(result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (result?.exit === EXIT_OK) {
    if (status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true) {
      return { nextAction: 'pass', issueType: 'policy', outcomeClass: 'timeout_continue' };
    }
    return { nextAction: 'pass', issueType: undefined, outcomeClass: status === APPROVAL_STATUS.APPROVED ? 'approved' : 'passed' };
  }

  if (result?.status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return { nextAction: 'block', issueType: 'unknown', outcomeClass: 'corrupted_state' };
  }

  if (status === APPROVAL_STATUS.REJECTED || status === APPROVAL_STATUS.CANCELLED || status === APPROVAL_STATUS.TIMED_OUT) {
    return { nextAction: 'block', issueType: 'policy', outcomeClass: status.toLowerCase() };
  }

  return { nextAction: 'block', issueType: 'unknown', outcomeClass: 'error' };
}

function buildApprovalControlSummary(gateId, result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (result?.exit === EXIT_OK && status === APPROVAL_STATUS.APPROVED) {
    return `Approval gate '${gateId}' approved`;
  }
  if (result?.exit === EXIT_OK && status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true) {
    return `Approval gate '${gateId}' timed out and auto-continued`;
  }
  if (status === APPROVAL_STATUS.REJECTED) {
    return result?.reason || `Approval gate '${gateId}' rejected`;
  }
  if (status === APPROVAL_STATUS.CANCELLED) {
    return result?.reason || `Approval gate '${gateId}' cancelled`;
  }
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    return result?.reason || `Approval gate '${gateId}' timed out`;
  }
  if (result?.status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return result?.reason || `Approval gate '${gateId}' has corrupted persisted state`;
  }
  return result?.reason || `Approval gate '${gateId}' failed`;
}

function buildApprovalFindings(result = {}) {
  const status = String(result?.status || '').trim().toUpperCase();
  if (result?.exit === EXIT_OK) return [];

  if (result?.status === 'CORRUPTED_STATE' || result?.corrupted_state === true) {
    return [{
      code: 'APPROVAL_STATE_CORRUPTED',
      severity: 'critical',
      message: result?.reason || 'Approval gate persisted state is corrupted',
      category: 'approval',
      target: result?.gate_id || null,
      retryable: false,
      environmentIssue: false,
    }];
  }

  return [{
    code: `APPROVAL_${status || 'FAILED'}`,
    severity: 'error',
    message: result?.reason || `Approval gate resolved as ${status || 'FAILED'}`,
    category: 'approval',
    target: result?.gate_id || null,
    retryable: false,
    environmentIssue: false,
  }];
}

export function buildApprovalGateControlResult(config, gateId, gate, result = {}, opts = {}) {
  const mapped = mapApprovalLegacyExitToControl(result);
  const runId = config?._runId || config?.run_id || null;
  const timeoutPolicy = normalizeApprovalTimeoutPolicy(
    result?.timeout_policy || opts?.input?.stateSnapshot?.gate?.gate_status_timeout_policy || gate?.on_timeout,
    APPROVAL_TIMEOUT_POLICY.BLOCK,
  );
  const status = String(result?.status || '').trim().toUpperCase() || null;
  const metadata = {
    gate_id: gateId,
    gate_type: gate?.type || 'approval',
    run_id: runId,
    legacy_exit: result?.exit ?? EXIT_ERROR,
    legacy_status: status,
    reason: result?.reason || null,
    timeout_policy: timeoutPolicy,
    continued: result?.continued === true,
    timed_out: result?.timed_out === true || status === APPROVAL_STATUS.TIMED_OUT,
    decision_by: result?.decision_by || null,
    decision_via: result?.decision_via || null,
    corrupted_state: result?.corrupted_state === true || result?.status === 'CORRUPTED_STATE',
    wait_ref: opts?.input?.refs?.waitRef || null,
    scheduler_consumed: status === APPROVAL_STATUS.APPROVED || (status === APPROVAL_STATUS.TIMED_OUT && result?.continued === true),
    legacy_result: cloneSerializable(result),
  };

  return buildTypedGateControlResult({
    producerType: 'approval',
    nextAction: mapped.nextAction,
    issueType: mapped.issueType,
    summary: buildApprovalControlSummary(gateId, result),
    findings: buildApprovalFindings({ ...result, gate_id: gateId }),
    metadata,
    gateRunStatus: status,
    outcomeClass: mapped.outcomeClass,
    recommendation: mapped.nextAction === 'pass' ? 'proceed' : 'stop',
    metrics: {
      continued: result?.continued === true,
      timed_out: result?.timed_out === true || status === APPROVAL_STATUS.TIMED_OUT,
    },
  });
}

export function isApprovalGateControlResult(result) {
  return isTypedGateControlResult(result, 'approval');
}

export function coerceApprovalGateControlResult(config, gateId, gate, result, opts = {}) {
  return coerceTypedGateControlResult(result, {
    producerType: 'approval',
    build: () => buildApprovalGateControlResult(config, gateId, gate, result, opts),
  });
}

export function extractApprovalGateLegacyResult(result, gateId, gate) {
  return extractTypedGateLegacyResult(result, gateId, gate, {
    producerType: 'approval',
    buildFallbackLegacyResult: ({ metadata, result: controlResult }) => {
      const legacyStatus = metadata?.legacy_status || (controlResult?.nextAction === 'pass' ? APPROVAL_STATUS.APPROVED : 'FAILED');
      const continued = metadata?.continued === true;
      return {
        exit: metadata?.legacy_exit ?? (controlResult?.nextAction === 'pass' ? EXIT_OK : EXIT_NEEDS_NOVA),
        status: legacyStatus,
        reason: metadata?.reason || controlResult?.diagnostics?.summary || null,
        continued,
        timed_out: metadata?.timed_out === true,
        timeout_policy: metadata?.timeout_policy || null,
        decision_by: metadata?.decision_by || null,
        decision_via: metadata?.decision_via || null,
        corrupted_state: metadata?.corrupted_state === true,
        gate_id: gateId,
        gate_type: gate?.type || 'approval',
      };
    },
  });
}

// ─── Internal helpers (also used as injectable defaults) ──────────────────────

function _loadGateState(config, gateId) {
  const p = gateStatusPath(config, gateId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    let preview = '';
    try {
      preview = fs.readFileSync(p, 'utf8').slice(0, 200);
    } catch { /* unreadable */ }
    return {
      _corrupted_gate_state: true,
      gate_id: gateId,
      gate_type: 'approval',
      project: config?.project || null,
      parse_error: error?.message || 'Failed to parse approval gate state',
      parse_error_path: p,
      parse_error_preview: preview,
    };
  }
}

function buildCorruptedApprovalStateReason(gateId, state = {}) {
  const parseError = state?.parse_error || 'invalid JSON';
  const filePath = state?.parse_error_path || `gate:${gateId}`;
  return `Approval gate '${gateId}' has corrupted persisted state at '${filePath}': ${parseError}`;
}

async function failClosedOnCorruptedApprovalState(config, gateId, gate, state, deps) {
  const reason = buildCorruptedApprovalStateReason(gateId, state);
  const preview = state?.parse_error_preview
    ? state.parse_error_preview.replace(/\s+/g, ' ').trim().slice(0, 200)
    : '(unavailable)';

  log('ERROR', `${reason}. Refusing to start a fresh approval flow over corrupted persisted state.`);
  await deps.discord(config, 'CRITICAL', `Approval state corrupted: ${gate?.title || gateId}`,
    `Gate \`${gateId}\` has unreadable persisted approval state. Refusing to reopen or reset the wait automatically. Operator intervention required.`,
    buildApprovalGateDiscordFields({ run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate?.type || 'approval' }, [
      { name: 'Action', value: 'Failing closed. Repair or remove the corrupted gate-state file before retrying.', inline: false },
      { name: 'State file', value: `\`${state?.parse_error_path || 'unknown'}\``, inline: false },
      { name: 'Parse error', value: (state?.parse_error || 'unknown').slice(0, 1000), inline: false },
      { name: 'Preview', value: preview ? `\`${preview}\`` : '(unavailable)', inline: false },
      { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\``, inline: false },
    ])
  );

  return {
    exit: EXIT_NEEDS_NOVA,
    status: 'CORRUPTED_STATE',
    reason,
    gate_id: gateId,
    corrupted_state: true,
  };
}

function _saveGateState(config, gateId, state) {
  const p = gateStatusPath(config, gateId);
  const tmp = p + '.tmp';
  state = normalizeApprovalGateState(state, {
    gate_id: gateId,
    gate_type: state?.gate_type || 'approval',
    project: config.project,
  });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function _appendTransition(config, gateId, from, to, note = '', identity = {}) {
  if (!config._logDir) return;
  const dir = gateLogDir(config, gateId);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      run_id: identity.run_id || config._runId || config.run_id || null,
      project: identity.project || config.project || null,
      gate_id: identity.gate_id || gateId,
      gate_type: identity.gate_type || null,
      from,
      to,
      note,
    };
    fs.appendFileSync(path.join(dir, 'approval-transitions.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* non-critical */ }
}

function _writeApprovalRequest(config, gateId, gate, state) {
  if (!config._logDir) return;
  const dir = gateLogDir(config, gateId);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }

  state = normalizeApprovalGateState(state, buildApprovalIdentity(config, gateId, gate, state));

  const payload = {
    gate_id:      gateId,
    gate_type:    state.gate_type || gate.type || 'approval',
    gate_title:   gate.title,
    run_id:       state.run_id,
    project:      config.project,
    status:       APPROVAL_STATUS.PENDING_APPROVAL,
    requested_at: state.requested_at,
    deadline:     state.deadline,
    timeout_minutes: state.timeout_minutes,
    timeout_policy:  state.timeout_policy,
    operator_instructions: [
      `APPROVE gate:${gateId}`,
      `REJECT gate:${gateId} reason: <your reason>`,
    ],
    artifacts_dir: `logs/gates/${gateId}/`,
  };

  try {
    fs.writeFileSync(
      path.join(dir, 'approval-request.json'),
      JSON.stringify(payload, null, 2) + '\n'
    );
  } catch { /* non-critical */ }

  try {
    fs.writeFileSync(
      path.join(dir, 'approval-request.md'),
      _buildRequestMarkdown(gateId, gate, state)
    );
  } catch { /* non-critical */ }
}

function _writeApprovalDecision(config, gateId, state) {
  if (!config._logDir) return;
  const dir = gateLogDir(config, gateId);
  state = normalizeApprovalGateState(state, {
    gate_id: gateId,
    gate_type: state?.gate_type || 'approval',
    project: config.project,
  });
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'approval-decision.json'),
      JSON.stringify(state, null, 2) + '\n'
    );
  } catch { /* non-critical */ }
}

function _buildRequestMarkdown(gateId, gate, state) {
  state = normalizeApprovalGateState(state, { gate_id: gateId, gate_type: gate?.type || 'approval' });
  const deadline = state.deadline ? new Date(state.deadline).toUTCString() : 'unknown';
  const timeoutNote = isApprovalTimeoutContinue(state.timeout_policy)
    ? `${APPROVAL_TIMEOUT_POLICY.CONTINUE} — Pipeline will CONTINUE automatically on timeout.`
    : `${APPROVAL_TIMEOUT_POLICY.BLOCK} — Pipeline will BLOCK and escalate on timeout.`;

  return [
    `# Approval Required: ${gate.title}`,
    '',
    `**Gate ID:** \`${gateId}\``,
    `**Gate Type:** ${state.gate_type || gate?.type || 'approval'}`,
    `**Project:** ${state.project || 'unknown'}`,
    `**Run ID:** ${state.run_id || 'unknown'}`,
    `**Requested at:** ${state.requested_at}`,
    `**Deadline:** ${deadline}`,
    `**Timeout policy:** ${timeoutNote}`,
    '',
    '## How to Respond',
    '',
    'Reply via OpenClaw/Nova with one of:',
    '',
    '```',
    `APPROVE gate:${gateId}`,
    '```',
    '```',
    `REJECT gate:${gateId} reason: <your reason here>`,
    '```',
    '',
    '## Artifacts',
    `- Request JSON:  \`.swarm/logs/gates/${gateId}/approval-request.json\``,
    `- Transitions:   \`.swarm/logs/gates/${gateId}/approval-transitions.jsonl\``,
    `- Decision:      \`.swarm/logs/gates/${gateId}/approval-decision.json\``,
  ].join('\n');
}

// ─── Discord embed builder ────────────────────────────────────────────────────

/**
 * Build a decision-ready Discord embed with enough pipeline context for the
 * operator to approve or reject without opening multiple files.
 */
export function buildApprovalEmbed(config, gateId, gate, state, progress) {
  state = normalizeApprovalGateState(state);
  const deadline = state.deadline ? new Date(state.deadline).toUTCString() : 'unknown';
  const timeoutNote = isApprovalTimeoutContinue(state.timeout_policy)
    ? `AUTO-CONTINUE after ${state.timeout_minutes}min`
    : `BLOCK after ${state.timeout_minutes}min`;

  // Gather execution context from progress
  const execOrder = progress?.execution_order || [];
  const gateIdx = execOrder.indexOf(`gate:${gateId}`);

  const completedSteps = gateIdx > 0
    ? execOrder.slice(0, gateIdx).filter(s => !s.startsWith('gate:'))
    : [];
  const remainingSteps = gateIdx >= 0
    ? execOrder.slice(gateIdx + 1).filter(s => !s.startsWith('gate:'))
    : [];

  const completedSummary = completedSteps.length > 0
    ? completedSteps.slice(-3).join(', ') + (completedSteps.length > 3 ? ` (+${completedSteps.length - 3} earlier)` : '')
    : 'none';

  const remainingSummary = remainingSteps.length > 0
    ? remainingSteps.slice(0, 3).join(', ') + (remainingSteps.length > 3 ? ` (+${remainingSteps.length - 3} more)` : '')
    : 'none (gate is near end of pipeline)';

  const description = gate.description
    || `Pipeline paused at approval gate \`${gateId}\`. Explicit operator decision required to continue.`;

  const fields = [
    { name: 'Gate',        value: `\`${gateId}\` — ${gate.title}`, inline: false },
    { name: 'Project',     value: state.project || config.project || 'unknown', inline: true },
    { name: 'Run ID',      value: state.run_id || 'unknown', inline: true },
    { name: 'Deadline',    value: deadline, inline: false },
    { name: 'On Timeout',  value: timeoutNote, inline: true },
    { name: 'Completed Steps', value: completedSummary, inline: false },
    { name: 'Remaining Steps', value: remainingSummary, inline: false },
    ...buildGovernanceEmbedFields(config),
    { name: 'To Approve',  value: `\`APPROVE gate:${gateId}\``, inline: true },
    { name: 'To Reject',   value: `\`REJECT gate:${gateId} reason: ...\``, inline: true },
    { name: 'Artifacts',   value: `\`.swarm/logs/gates/${gateId}/\``, inline: false },
  ];

  return { description, fields };
}

// ─── Deps injection ───────────────────────────────────────────────────────────

const DEFAULT_DEPS = {
  discord:              discordIntegration,
  loadGateState:        _loadGateState,
  saveGateState:        _saveGateState,
  appendTransition:     _appendTransition,
  writeApprovalRequest: _writeApprovalRequest,
  writeApprovalDecision: _writeApprovalDecision,
  sleep: (ms) => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(),
};

function getDeps(config) {
  return { ...DEFAULT_DEPS, ...(config?._testOverrides?.approvalGate || {}) };
}

// ─── Timeout resolution ───────────────────────────────────────────────────────

async function resolveTimeout(config, gateId, gate, state, timeoutPolicy, deps) {
  const normalizedTimeoutPolicy = normalizeApprovalTimeoutPolicy(timeoutPolicy, state?.timeout_policy);
  recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.TIMED_OUT, null,
    `No decision received within ${state.timeout_minutes} minutes`, {
      gate_type: gate?.type || 'approval',
      run_id: state?.run_id || config._runId || config.run_id || null,
      project: config.project || null,
      decision_via: state?.decision_via || 'timeout',
      timeout_policy: normalizedTimeoutPolicy,
      continued: normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
    });
  onApprovalResolved({ config }, gateId, APPROVAL_STATUS.TIMED_OUT, null, { gate_type: gate?.type || 'approval' });
  emitApprovalGateVerdict(config, gateId, gate, 'NO-GO', `Approval timed out after ${state.timeout_minutes} minutes`, {
    presentation: {
      discord: {
        level: normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE ? 'WARN' : 'CRITICAL',
        title: normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE ? `Approval Timeout (auto-continue): ${gate.title}` : `Approval Timeout (blocked): ${gate.title}`,
        description: normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE
          ? `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Configured to auto-continue.`
          : `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Pipeline halted — operator approval required.`,
        fields: buildApprovalGateDiscordFields({ run_id: state.run_id, gate_id: gateId, gate_type: gate.type }, normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE
          ? [
            { name: 'Gate ID', value: gateId },
            { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.CONTINUE },
            { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
          ]
          : [
            { name: 'Gate ID', value: gateId },
            { name: 'Policy', value: APPROVAL_TIMEOUT_POLICY.BLOCK },
            { name: 'To Approve', value: `\`APPROVE gate:${gateId}\`` },
            { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
          ]),
      },
    },
  });

  if (normalizedTimeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE) {
    log('WARN', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.CONTINUE}, proceeding`);
    return { exit: EXIT_OK, status: APPROVAL_STATUS.TIMED_OUT, timed_out: true, continued: true, gate_id: gateId };
  }

  log('ERROR', `Approval gate '${gateId}' timed out — timeout_policy=${APPROVAL_TIMEOUT_POLICY.BLOCK}, halting pipeline`);
  return {
    exit:      EXIT_NEEDS_NOVA,
    status:    APPROVAL_STATUS.TIMED_OUT,
    reason:    `Approval gate '${gateId}' timed out after ${state.timeout_minutes} minutes`,
    gate_id:   gateId,
    timed_out: true,
  };
}

// ─── Polling loop ─────────────────────────────────────────────────────────────

async function pollForApproval(config, gateId, gate, state, progress, timeoutPolicy, pollIntervalMs, deps) {
  timeoutPolicy = normalizeApprovalTimeoutPolicy(timeoutPolicy, state?.timeout_policy);
  while (true) {
    const nowMs = Date.now();
    // Re-read deadline each iteration so saveGateState mutations take effect
    const deadlineMs = new Date(state.deadline).getTime();

    // Check timeout before reading state
    if (nowMs >= deadlineMs) {
      log('WARN', `Approval gate '${gateId}' timed out (${state.timeout_minutes}min elapsed)`);
      const timedOut = {
        ...state,
        status:       APPROVAL_STATUS.TIMED_OUT,
        timeout_policy: timeoutPolicy,
        resolved_at:  new Date().toISOString(),
        decision_via: 'timeout',
        continued:    timeoutPolicy === APPROVAL_TIMEOUT_POLICY.CONTINUE,
        reason:       `No decision received within ${state.timeout_minutes} minutes`,
      };
      syncApprovalWaitState(config, gateId, gate, timedOut);
      deps.saveGateState(config, gateId, timedOut);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
      deps.writeApprovalDecision(config, gateId, timedOut);
      return resolveTimeout(config, gateId, gate, timedOut, timeoutPolicy, deps);
    }

    // Read current authoritative state
    const rawCurrent = deps.loadGateState(config, gateId);
    const current = normalizeApprovalGateState(rawCurrent, buildApprovalIdentity(config, gateId, gate, rawCurrent));
    if (current && rawCurrent && (
      current.timeout_policy !== rawCurrent.timeout_policy ||
      current.gate_id !== rawCurrent.gate_id ||
      current.gate_type !== rawCurrent.gate_type ||
      current.project !== rawCurrent.project
    )) {
      deps.saveGateState(config, gateId, current);
    }
    const status = (current?.status || '').toUpperCase();

    if (status === APPROVAL_STATUS.APPROVED) {
      log('OK', `Approval gate '${gateId}' APPROVED by ${current.decision_by || 'unknown'}`);
      syncApprovalWaitState(config, gateId, gate, current);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.APPROVED, current.reason || '', buildApprovalIdentity(config, gateId, gate, current));
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.APPROVED, current.decision_by, current.reason, {
        gate_type: gate?.type || 'approval',
        run_id: current?.run_id || config._runId || config.run_id || null,
        project: config.project || null,
        decision_via: current?.decision_via || null,
        timeout_policy: current?.timeout_policy || null,
        continued: current?.continued,
      });
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.APPROVED, current.decision_by, { gate_type: gate.type || 'approval' });
      emitApprovalGateVerdict(config, gateId, gate, 'GO', current.reason || 'Approved by operator', {
        presentation: {
          discord: {
            level: 'OK',
            title: `Approved: ${gate.title}`,
            description: `Gate \`${gateId}\` approved. Pipeline resuming.`,
            fields: buildApprovalGateDiscordFields({ run_id: current.run_id || config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type }, [
              { name: 'Approved by', value: current.decision_by || 'operator' },
              { name: 'Decision via', value: current.decision_via || 'unknown' },
              { name: 'Reason', value: current.reason || 'none' },
            ]),
          },
        },
      });
      return { exit: EXIT_OK, status: APPROVAL_STATUS.APPROVED, gate_id: gateId };
    }

    if (status === APPROVAL_STATUS.REJECTED) {
      log('WARN', `Approval gate '${gateId}' REJECTED by ${current.decision_by || 'unknown'}`);
      syncApprovalWaitState(config, gateId, gate, current);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.REJECTED, current.reason || '', buildApprovalIdentity(config, gateId, gate, current));
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.REJECTED, current.decision_by, current.reason, {
        gate_type: gate?.type || 'approval',
        run_id: current?.run_id || config._runId || config.run_id || null,
        project: config.project || null,
        decision_via: current?.decision_via || null,
        timeout_policy: current?.timeout_policy || null,
        continued: current?.continued,
      });
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.REJECTED, current.decision_by, { gate_type: gate.type || 'approval' });
      emitApprovalGateVerdict(config, gateId, gate, 'NO-GO', current.reason || 'Rejected by operator', {
        presentation: {
          discord: {
            level: 'CRITICAL',
            title: `Rejected: ${gate.title}`,
            description: `Gate \`${gateId}\` rejected. Pipeline halted — operator intervention required.`,
            fields: buildApprovalGateDiscordFields({ run_id: current.run_id || config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate.type }, [
              { name: 'Rejected by', value: current.decision_by || 'operator' },
              { name: 'Reason', value: (current.reason || 'none given').slice(0, 200) },
              { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
            ]),
          },
        },
      });
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.REJECTED,
        reason:  `Gate '${gateId}' rejected: ${current.reason || 'no reason given'}`,
        gate_id: gateId,
      };
    }

    if (status === APPROVAL_STATUS.CANCELLED) {
      log('WARN', `Approval gate '${gateId}' CANCELLED`);
      syncApprovalWaitState(config, gateId, gate, current);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.CANCELLED, current?.reason || '', buildApprovalIdentity(config, gateId, gate, current));
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.CANCELLED, null, current?.reason, {
        gate_type: gate?.type || 'approval',
        run_id: current?.run_id || config._runId || config.run_id || null,
        project: config.project || null,
        decision_via: current?.decision_via || null,
        timeout_policy: current?.timeout_policy || null,
        continued: current?.continued,
      });
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.CANCELLED, null, { gate_type: gate.type || 'approval' });
      emitApprovalGateVerdict(config, gateId, gate, 'NO-GO', current?.reason || 'Approval cancelled');
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.CANCELLED,
        reason:  `Gate '${gateId}' cancelled`,
        gate_id: gateId,
      };
    }

    // Still pending — wait and check again
    const remainingMs = deadlineMs - nowMs;
    const waitMs = Math.min(pollIntervalMs, remainingMs);
    log('INFO', `Gate '${gateId}' PENDING_APPROVAL — ${Math.round(remainingMs / 60000)}min remaining. Next check in ${Math.round(waitMs / 1000)}s.`);
    await deps.sleep(waitMs);
  }
}

// ─── Main gate runner ─────────────────────────────────────────────────────────

export async function runApprovalGate(config, progress, gateId, opts = {}) {
  const gate = progress.gates[gateId];
  if (!gate) throw new Error(`Approval gate '${gateId}' not found`);

  const timeoutMinutes  = gate.timeout_minutes ?? config.default_timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES;
  const timeoutPolicy   = normalizeApprovalTimeoutPolicy(gate.on_timeout);
  const pollIntervalMs  = config._approvalPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deps            = getDeps(config);

  log('STEP', `════════════════════════════════════════════════════`);
  log('STEP', `  APPROVAL GATE: ${gate.title}`);
  log('STEP', `  timeout: ${timeoutMinutes}min | on_timeout: ${gate.on_timeout || 'block'} | timeout_policy: ${timeoutPolicy}`);
  log('STEP', `════════════════════════════════════════════════════`);

  // ── 1. Check existing state (resume safety) ──────────────────────────────
  const loadedGateState = deps.loadGateState(config, gateId);
  if (loadedGateState?._corrupted_gate_state) {
    return failClosedOnCorruptedApprovalState(config, gateId, gate, loadedGateState, deps);
  }
  let gateState = normalizeApprovalGateState(loadedGateState, buildApprovalIdentity(config, gateId, gate, loadedGateState));
  gateState = normalizeApprovalGateState(syncApprovalWaitState(config, gateId, gate, gateState), buildApprovalIdentity(config, gateId, gate, gateState)) || gateState;
  if (gateState && loadedGateState && (
    gateState.timeout_policy !== loadedGateState.timeout_policy ||
    gateState.gate_id !== loadedGateState.gate_id ||
    gateState.gate_type !== loadedGateState.gate_type ||
    gateState.project !== loadedGateState.project
  )) {
    deps.saveGateState(config, gateId, gateState);
  }

  if (gateState) {
    const s = (gateState.status || '').toUpperCase();

    if (s === APPROVAL_STATUS.APPROVED) {
      log('OK', `Approval gate '${gateId}' already APPROVED — restoring resolved telemetry`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'GO',
        fallbackReason: 'Approved by operator',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return { exit: EXIT_OK, status: APPROVAL_STATUS.APPROVED, gate_id: gateId };
    }

    if (s === APPROVAL_STATUS.REJECTED) {
      log('WARN', `Approval gate '${gateId}' already REJECTED — restoring resolved telemetry before halting`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'NO-GO',
        fallbackReason: 'Rejected by operator',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.REJECTED,
        reason:  `Gate '${gateId}' was previously rejected: ${gateState.reason || 'no reason given'}`,
        gate_id: gateId,
      };
    }

    if (s === APPROVAL_STATUS.CANCELLED) {
      log('WARN', `Approval gate '${gateId}' already CANCELLED — restoring resolved telemetry before halting`);
      replayResolvedApprovalTelemetry(config, gateId, gate, gateState, {
        verdict: 'NO-GO',
        fallbackReason: 'Approval cancelled',
      });
      deps.writeApprovalDecision(config, gateId, gateState);
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.CANCELLED,
        reason:  `Gate '${gateId}' cancelled`,
        gate_id: gateId,
      };
    }

    if (s === APPROVAL_STATUS.TIMED_OUT) {
      log('WARN', `Approval gate '${gateId}' already TIMED_OUT — re-resolving`);
      return resolveTimeout(config, gateId, gate, gateState, gateState.timeout_policy || timeoutPolicy, deps);
    }

    if (s === APPROVAL_STATUS.PENDING_APPROVAL) {
      // Resume — check if timeout already elapsed
      const requestedMs    = new Date(gateState.requested_at).getTime();
      const stateTimeoutMs = (gateState.timeout_minutes ?? timeoutMinutes) * 60 * 1000;

      if (Date.now() >= requestedMs + stateTimeoutMs) {
        log('WARN', `Approval gate '${gateId}' timeout elapsed during restart — marking TIMED_OUT`);
        const timedOut = {
          ...gateState,
          status:       APPROVAL_STATUS.TIMED_OUT,
          timeout_policy: normalizeApprovalTimeoutPolicy(gateState.timeout_policy || timeoutPolicy),
          resolved_at:  new Date().toISOString(),
          decision_via: 'timeout',
          continued:    normalizeApprovalTimeoutPolicy(gateState.timeout_policy || timeoutPolicy) === APPROVAL_TIMEOUT_POLICY.CONTINUE,
          reason:       `Timeout elapsed during pipeline restart`,
        };
        syncApprovalWaitState(config, gateId, gate, timedOut);
        deps.saveGateState(config, gateId, timedOut);
        deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason, buildApprovalIdentity(config, gateId, gate, timedOut));
        deps.writeApprovalDecision(config, gateId, timedOut);
        return resolveTimeout(config, gateId, gate, timedOut, timedOut.timeout_policy || timeoutPolicy, deps);
      }

      // Still within window — resume polling without re-posting the request
      log('INFO', `Resuming PENDING_APPROVAL for gate '${gateId}' (no duplicate request posted)`);
      return pollForApproval(config, gateId, gate, gateState, progress, gateState.timeout_policy || timeoutPolicy, pollIntervalMs, deps);
    }
  }

  // ── 2. Fresh start — initialize PENDING_APPROVAL ──────────────────────────
  const nowIso      = new Date().toISOString();
  const deadlineIso = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();

  gateState = {
    gate_id:             gateId,
    gate_type:           gate.type || 'approval',
    status:              APPROVAL_STATUS.PENDING_APPROVAL,
    run_id:              config._runId || config.run_id || 'unknown',
    project:             config.project,
    requested_at:        nowIso,
    deadline:            deadlineIso,
    timeout_minutes:     timeoutMinutes,
    timeout_policy:      timeoutPolicy,
    resolved_at:         null,
    decision_by:         null,
    decision_via:        null,
    continued:           null,
    reason:              null,
    request_message_ref: null,
  };

  syncApprovalWaitState(config, gateId, gate, gateState);
  deps.saveGateState(config, gateId, gateState);
  deps.appendTransition(config, gateId, null, APPROVAL_STATUS.PENDING_APPROVAL, 'Gate initialized', buildApprovalIdentity(config, gateId, gate, gateState));
  deps.writeApprovalRequest(config, gateId, gate, gateState);

  log('INFO', `Approval gate '${gateId}' → PENDING_APPROVAL (deadline: ${deadlineIso})`);
  const embed = buildApprovalEmbed(config, gateId, gate, gateState, progress);
  const requestPresentation = {
    level: 'WARN',
    title: `⏸️ Approval Required: ${gate.title}`,
    description: embed.description,
    fields: buildApprovalGateDiscordFields({ run_id: gateState.run_id, gate_id: gateId, gate_type: gate.type }, embed.fields),
  };
  await onGateStarted({ config }, gateId, gate, {
    presentation: {
      discord: requestPresentation,
    },
  });
  onApprovalRequested({ config }, gateId, gate.title, timeoutMinutes, timeoutPolicy, { gate_type: gate.type || 'approval' });

  // ── 3. Post Discord approval request ──────────────────────────────────────
  // ── 4. Poll for resolution ────────────────────────────────────────────────
  return pollForApproval(config, gateId, gate, gateState, progress, timeoutPolicy, pollIntervalMs, deps);
}

export async function runApprovalGateStage(config, progress, gateId, opts = {}) {
  const gate = progress?.gates?.[gateId] || null;
  const result = await runApprovalGate(config, progress, gateId, opts);
  return buildApprovalGateControlResult(config, gateId, gate, result, opts);
}

export default runApprovalGate;
