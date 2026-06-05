// runners/approval-gate-state.ts — approval gate persistence and audit artifacts

import fs from 'fs';
import { log } from '../core/logger.ts';
import { EXIT_NEEDS_NOVA } from '../core/constants.ts';
import { approvalGateArtifactPaths, approvalGateArtifactRefPaths, gateStatusPath } from '../core/paths.ts';
import { discord as discordIntegration } from '../integrations/discord.ts';
import {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalIdentity,
  isApprovalTimeoutContinue,
  normalizeApprovalGateState,
} from './approval-gate-shared.ts';
import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';
import { appendDurableOperatorAlert } from '../services/durable-operator-alert.ts';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function recordApprovalAuditDegraded(config, gateId, artifact, error) {
  log('WARN', `Approval gate '${gateId}' audit artifact '${artifact}' write failed: ${errorMessage(error)}`);
  appendDurableOperatorAlert(config, 'pipeline.operator_alert', {
    reason: 'approval_audit_write_failed',
    gate_id: gateId,
    gate_type: 'approval',
    artifact,
    error: errorMessage(error),
  }, {
    severity: 'WARN',
    source: 'approval_gate_audit',
    emitter: 'nova/pipeline/runners/approval-gate-state',
  });
}

export function loadApprovalGateState(config, gateId) {
  const p = gateStatusPath(config, gateId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    let preview = '';
    try {
      preview = fs.readFileSync(p, 'utf8').slice(0, 200);
    } catch (_error) { /* unreadable */ }
    return {
      _corrupted_gate_state: true,
      gate_id: gateId,
      gate_type: 'approval',
      project: config?.project || null,
      parse_error: errorMessage(error) || 'Failed to parse approval gate state',
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

function buildInvalidApprovalStateReason(gateId, state = {}) {
  if (state?.invalid_state_error) {
    const filePath = state?.state_path || `gate:${gateId}`;
    return `Approval gate '${gateId}' has invalid persisted state at '${filePath}': ${state.invalid_state_error}; refusing to reopen or reset approval automatically`;
  }
  const status = state?.status == null || String(state.status).trim() === ''
    ? 'missing'
    : String(state.status);
  const filePath = state?.state_path || `gate:${gateId}`;
  return `Approval gate '${gateId}' has invalid persisted state status '${status}' at '${filePath}'; refusing to reopen or reset approval automatically`;
}

export async function failClosedOnCorruptedApprovalState(config, gateId, gate, state, deps) {
  const reason = buildCorruptedApprovalStateReason(gateId, state);
  const preview = state?.parse_error_preview
    ? state.parse_error_preview.replace(/\s+/g, ' ').trim().slice(0, 200)
    : '(unavailable)';

  log('ERROR', `${reason}. Refusing to start a fresh approval flow over corrupted persisted state.`);
  await deps.discord(config, 'CRITICAL', `Approval state corrupted: ${gate?.title || gateId}`,
    `Gate \`${gateId}\` has unreadable persisted approval state. Refusing to reopen or reset the wait automatically. Operator intervention required.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate?.type || 'approval' }, [
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

export async function failClosedOnInvalidApprovalState(config, gateId, gate, state, deps) {
  const stateWithPath = {
    ...(state || {}),
    state_path: gateStatusPath(config, gateId),
  };
  const reason = buildInvalidApprovalStateReason(gateId, stateWithPath);

  log('ERROR', `${reason}. Operator intervention required.`);
  await deps.discord(config, 'CRITICAL', `Approval state invalid: ${gate?.title || gateId}`,
    `Gate \`${gateId}\` has illegal persisted approval state. Refusing to reopen or reset the wait automatically. Operator intervention required.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, { run_id: config._runId || config.run_id || 'unknown', gate_id: gateId, gate_type: gate?.type || 'approval' }, [
      { name: 'Action', value: 'Failing closed. Repair or remove the invalid gate-state file before retrying.', inline: false },
      { name: 'State file', value: `\`${stateWithPath.state_path}\``, inline: false },
      { name: 'Status', value: String(state?.status ?? 'missing').slice(0, 200), inline: true },
      ...(state?.invalid_state_error ? [{ name: 'Invalid state', value: String(state.invalid_state_error).slice(0, 1000), inline: false }] : []),
      { name: 'Allowed statuses', value: Object.values(APPROVAL_STATUS).join(', '), inline: false },
    ])
  );

  return {
    exit: EXIT_NEEDS_NOVA,
    status: 'INVALID_STATE',
    reason,
    gate_id: gateId,
    invalid_state: true,
  };
}

export function saveApprovalGateState(config, gateId, state) {
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

export function appendApprovalTransition(config, gateId, from, to, note = '', identity = {}) {
  const paths = approvalGateArtifactPaths(config, gateId); if (!paths) return;
  try {
    fs.mkdirSync(paths.dir, { recursive: true });
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
    fs.appendFileSync(paths.transitionsJsonl, JSON.stringify(entry) + '\n');
  } catch (error) { recordApprovalAuditDegraded(config, gateId, 'transitions.jsonl', error); }
}

export function writeApprovalRequest(config, gateId, gate, state) {
  const paths = approvalGateArtifactPaths(config, gateId); if (!paths) return;
  try { fs.mkdirSync(paths.dir, { recursive: true }); } catch (error) { recordApprovalAuditDegraded(config, gateId, 'audit_dir', error); return; }

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
      paths.requestJson,
      JSON.stringify(payload, null, 2) + '\n'
    );
  } catch (error) { recordApprovalAuditDegraded(config, gateId, 'request.json', error); }

  try {
    fs.writeFileSync(
      paths.requestMarkdown,
      buildRequestMarkdown(gateId, gate, state, approvalGateArtifactRefPaths(config, gateId))
    );
  } catch (error) { recordApprovalAuditDegraded(config, gateId, 'request.md', error); }
}

export function writeApprovalDecision(config, gateId, state) {
  const paths = approvalGateArtifactPaths(config, gateId); if (!paths) return;
  state = normalizeApprovalGateState(state, {
    gate_id: gateId,
    gate_type: state?.gate_type || 'approval',
    project: config.project,
  });
  try {
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(
      paths.decisionJson,
      JSON.stringify(state, null, 2) + '\n'
    );
  } catch (error) { recordApprovalAuditDegraded(config, gateId, 'decision.json', error); }
}

function buildRequestMarkdown(gateId, gate, state, artifactRefs = {}) {
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
    `- Request JSON:  \`${artifactRefs.requestJson}\``,
    `- Transitions:   \`${artifactRefs.transitionsJsonl}\``,
    `- Decision:      \`${artifactRefs.decisionJson}\``,
  ].join('\n');
}

export const DEFAULT_APPROVAL_GATE_DEPS = {
  discord:              discordIntegration,
  loadGateState:        loadApprovalGateState,
  saveGateState:        saveApprovalGateState,
  appendTransition:     appendApprovalTransition,
  writeApprovalRequest,
  writeApprovalDecision,
  sleep: (ms) => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(),
};
