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
import { EXIT_OK, EXIT_NEEDS_NOVA } from '../core/constants.js';
import { gateStatusPath, gateLogDir } from '../core/paths.js';
import { discord as discordIntegration } from '../integrations/discord.js';
import { recordApprovalGateOutcome, buildGovernanceEmbedFields } from '../services/governance-context.js';
import { onApprovalRequested, onApprovalResolved } from '../services/telemetry.js';

// ─── Approval state constants ─────────────────────────────────────────────────

export const APPROVAL_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  TIMED_OUT:        'TIMED_OUT',
  CANCELLED:        'CANCELLED',
};

const DEFAULT_TIMEOUT_MINUTES = 60;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

// ─── Internal helpers (also used as injectable defaults) ──────────────────────

function _loadGateState(config, gateId) {
  const p = gateStatusPath(config, gateId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function _saveGateState(config, gateId, state) {
  const p = gateStatusPath(config, gateId);
  const tmp = p + '.tmp';
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function _appendTransition(config, gateId, from, to, note = '') {
  if (!config._logDir) return;
  const dir = gateLogDir(config, gateId);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entry = { ts: new Date().toISOString(), from, to, note };
    fs.appendFileSync(path.join(dir, 'approval-transitions.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* non-critical */ }
}

function _writeApprovalRequest(config, gateId, gate, state) {
  if (!config._logDir) return;
  const dir = gateLogDir(config, gateId);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }

  const payload = {
    gate_id:      gateId,
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
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'approval-decision.json'),
      JSON.stringify(state, null, 2) + '\n'
    );
  } catch { /* non-critical */ }
}

function _buildRequestMarkdown(gateId, gate, state) {
  const deadline = state.deadline ? new Date(state.deadline).toUTCString() : 'unknown';
  const timeoutNote = state.timeout_policy === 'continue'
    ? 'Pipeline will CONTINUE automatically on timeout.'
    : 'Pipeline will BLOCK and escalate on timeout.';

  return [
    `# Approval Required: ${gate.title}`,
    '',
    `**Gate ID:** \`${gateId}\``,
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
  const deadline = state.deadline ? new Date(state.deadline).toUTCString() : 'unknown';
  const timeoutNote = state.timeout_policy === 'continue'
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
  recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.TIMED_OUT, null,
    `No decision received within ${state.timeout_minutes} minutes`);
  onApprovalResolved({ config }, gateId, APPROVAL_STATUS.TIMED_OUT, null);

  if (timeoutPolicy === 'continue') {
    log('WARN', `Approval gate '${gateId}' timed out — on_timeout=continue, proceeding`);
    await deps.discord(config, 'WARN', `Approval Timeout (auto-continue): ${gate.title}`,
      `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Configured to auto-continue.`, [
        { name: 'Gate ID', value: gateId },
        { name: 'Policy',  value: 'continue' },
        { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
      ]);
    return { exit: EXIT_OK, status: APPROVAL_STATUS.TIMED_OUT, timed_out: true, continued: true, gate_id: gateId };
  }

  log('ERROR', `Approval gate '${gateId}' timed out — on_timeout=block, halting pipeline`);
  await deps.discord(config, 'CRITICAL', `Approval Timeout (blocked): ${gate.title}`,
    `Gate \`${gateId}\` timed out after ${state.timeout_minutes} minutes. Pipeline halted — operator approval required.`, [
      { name: 'Gate ID',     value: gateId },
      { name: 'Policy',      value: 'block' },
      { name: 'To Approve',  value: `\`APPROVE gate:${gateId}\`` },
      { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
    ]);
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
        resolved_at:  new Date().toISOString(),
        decision_via: 'timeout',
        reason:       `No decision received within ${state.timeout_minutes} minutes`,
      };
      deps.saveGateState(config, gateId, timedOut);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason);
      deps.writeApprovalDecision(config, gateId, timedOut);
      return resolveTimeout(config, gateId, gate, timedOut, timeoutPolicy, deps);
    }

    // Read current authoritative state
    const current = deps.loadGateState(config, gateId);
    const status = (current?.status || '').toUpperCase();

    if (status === APPROVAL_STATUS.APPROVED) {
      log('OK', `Approval gate '${gateId}' APPROVED by ${current.decision_by || 'unknown'}`);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.APPROVED, current.reason || '');
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.APPROVED, current.decision_by, current.reason);
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.APPROVED, current.decision_by);
      await deps.discord(config, 'OK', `Approved: ${gate.title}`,
        `Gate \`${gateId}\` approved. Pipeline resuming.`, [
          { name: 'Approved by',  value: current.decision_by || 'operator' },
          { name: 'Decision via', value: current.decision_via || 'unknown' },
          { name: 'Reason',       value: current.reason || 'none' },
        ]);
      return { exit: EXIT_OK, status: APPROVAL_STATUS.APPROVED, gate_id: gateId };
    }

    if (status === APPROVAL_STATUS.REJECTED) {
      log('WARN', `Approval gate '${gateId}' REJECTED by ${current.decision_by || 'unknown'}`);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.REJECTED, current.reason || '');
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.REJECTED, current.decision_by, current.reason);
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.REJECTED, current.decision_by);
      await deps.discord(config, 'CRITICAL', `Rejected: ${gate.title}`,
        `Gate \`${gateId}\` rejected. Pipeline halted — operator intervention required.`, [
          { name: 'Rejected by', value: current.decision_by || 'operator' },
          { name: 'Reason',      value: (current.reason || 'none given').slice(0, 200) },
          { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\`` },
        ]);
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.REJECTED,
        reason:  `Gate '${gateId}' rejected: ${current.reason || 'no reason given'}`,
        gate_id: gateId,
      };
    }

    if (status === APPROVAL_STATUS.CANCELLED) {
      log('WARN', `Approval gate '${gateId}' CANCELLED`);
      deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.CANCELLED, current?.reason || '');
      deps.writeApprovalDecision(config, gateId, current);
      recordApprovalGateOutcome(config, gateId, gate.title, APPROVAL_STATUS.CANCELLED, null, current?.reason);
      onApprovalResolved({ config }, gateId, APPROVAL_STATUS.CANCELLED, null);
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
  const timeoutPolicy   = gate.on_timeout || 'block';
  const pollIntervalMs  = config._approvalPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deps            = getDeps(config);

  log('STEP', `════════════════════════════════════════════════════`);
  log('STEP', `  APPROVAL GATE: ${gate.title}`);
  log('STEP', `  timeout: ${timeoutMinutes}min | on_timeout: ${timeoutPolicy}`);
  log('STEP', `════════════════════════════════════════════════════`);

  // ── 1. Check existing state (resume safety) ──────────────────────────────
  let gateState = deps.loadGateState(config, gateId);

  if (gateState) {
    const s = (gateState.status || '').toUpperCase();

    if (s === APPROVAL_STATUS.APPROVED) {
      log('OK', `Approval gate '${gateId}' already APPROVED — skipping`);
      return { exit: EXIT_OK, status: APPROVAL_STATUS.APPROVED };
    }

    if (s === APPROVAL_STATUS.REJECTED) {
      log('WARN', `Approval gate '${gateId}' already REJECTED — halting`);
      return {
        exit:    EXIT_NEEDS_NOVA,
        status:  APPROVAL_STATUS.REJECTED,
        reason:  `Gate '${gateId}' was previously rejected: ${gateState.reason || 'no reason given'}`,
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
          resolved_at:  new Date().toISOString(),
          decision_via: 'timeout',
          reason:       `Timeout elapsed during pipeline restart`,
        };
        deps.saveGateState(config, gateId, timedOut);
        deps.appendTransition(config, gateId, APPROVAL_STATUS.PENDING_APPROVAL, APPROVAL_STATUS.TIMED_OUT, timedOut.reason);
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
    reason:              null,
    request_message_ref: null,
  };

  deps.saveGateState(config, gateId, gateState);
  deps.appendTransition(config, gateId, null, APPROVAL_STATUS.PENDING_APPROVAL, 'Gate initialized');
  deps.writeApprovalRequest(config, gateId, gate, gateState);

  log('INFO', `Approval gate '${gateId}' → PENDING_APPROVAL (deadline: ${deadlineIso})`);
  onApprovalRequested({ config }, gateId, gate.title, timeoutMinutes, timeoutPolicy);

  // ── 3. Post Discord approval request ──────────────────────────────────────
  const embed = buildApprovalEmbed(config, gateId, gate, gateState, progress);
  await deps.discord(config, 'WARN', `⏸️ Approval Required: ${gate.title}`, embed.description, embed.fields);

  // ── 4. Poll for resolution ────────────────────────────────────────────────
  return pollForApproval(config, gateId, gate, gateState, progress, timeoutPolicy, pollIntervalMs, deps);
}

export default runApprovalGate;
