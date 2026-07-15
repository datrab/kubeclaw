import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// runners/approval-gate-state.ts — approval gate persistence and audit artifacts

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
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

const APPROVAL_GATE_TYPE = 'approval';
const APPROVAL_STATE_PARSE_ERROR = 'Failed to parse approval gate state';
const APPROVAL_STATE_INVALID_JSON = 'invalid JSON';
const APPROVAL_STATE_MISSING_STATUS = 'missing';
const APPROVAL_STATE_MISSING_PATH = 'missing_state_path';
const APPROVAL_STATE_MISSING_PARSE_ERROR = 'missing_parse_error';
const APPROVAL_STATE_MISSING_PROJECT = 'missing_project';
const APPROVAL_STATE_MISSING_RUN_ID = 'missing_recovery_target_id';

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function gateRef(gateId) {
  return `gate:${gateId}`;
}

function approvalGateType(...sources) {
  return selectPresentValue(...sources, APPROVAL_GATE_TYPE);
}

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
      gate_type: APPROVAL_GATE_TYPE,
      project: selectTruthyValue(() => (config?.project), () => (null)),
      parse_error: selectPresentValue(errorMessage(error), APPROVAL_STATE_PARSE_ERROR),
      parse_error_path: p,
      parse_error_preview: preview,
    };
  }
}

function buildCorruptedApprovalStateReason(gateId, state = {}) {
  const parseError = selectPresentValue(state?.parse_error, APPROVAL_STATE_INVALID_JSON);
  const filePath = selectPresentValue(state?.parse_error_path, gateRef(gateId));
  return `Approval gate '${gateId}' has corrupted persisted state at '${filePath}': ${parseError}`;
}

function invalidApprovalStatusAuthority(state = {}) {
  if (selectTruthyValue(() => (state?.status == null), () => (String(state.status).trim() === ''))) return APPROVAL_STATE_MISSING_STATUS;
  return String(state.status);
}

function buildInvalidApprovalStateReason(gateId, state = {}) {
  if (state?.invalid_state_error) {
    const filePath = selectPresentValue(state?.state_path, gateRef(gateId));
    return `Approval gate '${gateId}' has invalid persisted state at '${filePath}': ${state.invalid_state_error}; refusing to reopen or reset approval automatically`;
  }
  const status = invalidApprovalStatusAuthority(state);
  const filePath = selectPresentValue(state?.state_path, gateRef(gateId));
  return `Approval gate '${gateId}' has invalid persisted state status '${status}' at '${filePath}'; refusing to reopen or reset approval automatically`;
}

export async function failClosedOnCorruptedApprovalState(config, gateId, gate, state, deps) {
  const reason = buildCorruptedApprovalStateReason(gateId, state);
  const preview = state?.parse_error_preview
    ? state.parse_error_preview.replace(/\s+/g, ' ').trim().slice(0, 200)
    : '(unavailable)';
  const correlation = {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => (null)),
    gate_id: gateId,
    gate_type: approvalGateType(gate?.type),
  };

  log('ERROR', `${reason}. Refusing to start a fresh approval flow over corrupted persisted state.`);
  const corruptedStateTitle = gate?.title ? gate.title : gateId;
  await deps.discord(config, 'CRITICAL', `Approval state corrupted: ${corruptedStateTitle}`,
    `Gate \`${gateId}\` has unreadable persisted approval state. Refusing to reopen or reset the wait automatically. Operator intervention required.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, correlation, [
      { name: 'Action', value: 'Failing closed. Repair or remove the corrupted gate-state file before retrying.', inline: false },
      { name: 'State file', value: `\`${selectPresentValue(state?.parse_error_path, APPROVAL_STATE_MISSING_PATH)}\``, inline: false },
      { name: 'Parse error', value: selectPresentValue(state?.parse_error, APPROVAL_STATE_MISSING_PARSE_ERROR).slice(0, 1000), inline: false },
      { name: 'Preview', value: preview ? `\`${preview}\`` : '(unavailable)', inline: false },
      { name: 'Audit trail', value: `\`.swarm/logs/gates/${gateId}/\``, inline: false },
    ]),
    { correlation },
  );

  return {
    status: 'CORRUPTED_STATE',
    outcome_class: 'needs_nova',
    reason,
    gate_id: gateId,
    corrupted_state: true,
  };
}

export async function failClosedOnInvalidApprovalState(config, gateId, gate, state, deps) {
  const stateWithPath = {
    ...objectRecord(state),
    state_path: gateStatusPath(config, gateId),
  };
  const reason = buildInvalidApprovalStateReason(gateId, stateWithPath);
  const correlation = {
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (config._runId), () => (config.run_id))), () => (null)),
    gate_id: gateId,
    gate_type: approvalGateType(gate?.type),
  };

  log('ERROR', `${reason}. Operator intervention required.`);
  const invalidStateTitle = gate?.title ? gate.title : gateId;
  await deps.discord(config, 'CRITICAL', `Approval state invalid: ${invalidStateTitle}`,
    `Gate \`${gateId}\` has illegal persisted approval state. Refusing to reopen or reset the wait automatically. Operator intervention required.`,
    buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.APPROVAL_GATE, correlation, [
      { name: 'Action', value: 'Failing closed. Repair or remove the invalid gate-state file before retrying.', inline: false },
      { name: 'State file', value: `\`${stateWithPath.state_path}\``, inline: false },
      { name: 'Status', value: String(selectDefinedValue(() => (state?.status), () => (APPROVAL_STATE_MISSING_STATUS))).slice(0, 200), inline: true },
      ...(state?.invalid_state_error ? [{ name: 'Invalid state', value: String(state.invalid_state_error).slice(0, 1000), inline: false }] : []),
      { name: 'Allowed statuses', value: Object.values(APPROVAL_STATUS).join(', '), inline: false },
    ]),
    { correlation },
  );

  return {
    status: 'INVALID_STATE',
    outcome_class: 'needs_nova',
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
    gate_type: approvalGateType(state?.gate_type),
    project: config.project,
  });
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

export function appendApprovalTransition(config, gateId, from, to, note = '', identity = {}) {
  const paths = approvalGateArtifactPaths(config, gateId); if (!paths) return;
  try {
    fs.mkdirSync(paths.dir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (identity.run_id), () => (config._runId))), () => (config.run_id))), () => (null)),
      project: selectTruthyValue(() => (selectTruthyValue(() => (identity.project), () => (config.project))), () => (null)),
      gate_id: approvalTransitionGateId(identity, gateId),
      gate_type: selectTruthyValue(() => (identity.gate_type), () => (null)),
      from,
      to,
      note,
    };
    fs.appendFileSync(paths.transitionsJsonl, JSON.stringify(entry) + '\n');
  } catch (error) { recordApprovalAuditDegraded(config, gateId, 'transitions.jsonl', error); }
}

function approvalTransitionGateId(identity, gateId) {
  if (typeof identity?.gate_id === 'string' && identity.gate_id.trim()) return identity.gate_id.trim();
  if (typeof gateId === 'string' && gateId.trim()) return gateId.trim();
  throw new Error('Approval transition requires gate_id');
}

export function writeApprovalRequest(config, gateId, gate, state) {
  const paths = approvalGateArtifactPaths(config, gateId); if (!paths) return;
  try { fs.mkdirSync(paths.dir, { recursive: true }); } catch (error) { recordApprovalAuditDegraded(config, gateId, 'audit_dir', error); return; }

  state = normalizeApprovalGateState(state, buildApprovalIdentity(config, gateId, gate, state));

  const payload = {
    gate_id:      gateId,
    gate_type:    approvalGateType(state.gate_type, gate.type),
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
    gate_type: approvalGateType(state?.gate_type),
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
  state = normalizeApprovalGateState(state, { gate_id: gateId, gate_type: approvalGateType(gate?.type) });
  const deadline = state.deadline ? new Date(state.deadline).toUTCString()  : 'approval_deadline_missing';
  const timeoutNote = isApprovalTimeoutContinue(state.timeout_policy)
    ? `${APPROVAL_TIMEOUT_POLICY.CONTINUE} — Pipeline will CONTINUE automatically on timeout.`
    : `${APPROVAL_TIMEOUT_POLICY.BLOCK} — Pipeline will BLOCK and escalate on timeout.`;

  return [
    `# Approval Required: ${gate.title}`,
    '',
    `**Gate ID:** \`${gateId}\``,
    `**Gate Type:** ${approvalGateType(state.gate_type, gate?.type)}`,
    `**Project:** ${selectPresentValue(state.project, APPROVAL_STATE_MISSING_PROJECT)}`,
    `**Run ID:** ${selectPresentValue(state.run_id, APPROVAL_STATE_MISSING_RUN_ID)}`,
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
