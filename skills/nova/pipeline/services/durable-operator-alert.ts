import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/durable-operator-alert.js — local-first durable operator alert evidence.
// Writes synchronously to local JSONL artifacts before network/sink delivery.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { getRunId } from '../core/runtime.ts';
import { sanitizeDiscordMessage, sanitizeTelemetryPayload } from '../egress.ts';
import {
  buildNonBlockingIncidentKey,
  reportClassifiedNonBlockingError,
} from '../noncritical-reporting.ts';

const OPERATOR_ALERTS_JSONL = 'operator-alerts.jsonl';
const DURABLE_OPERATOR_ALERT_TYPE = 'pipeline.operator_alert';
const DURABLE_OPERATOR_ALERT_SOURCE = 'pipeline';
const DURABLE_OPERATOR_ALERT_EMITTER = 'nova/pipeline/services/durable-operator-alert';
const DURABLE_OPERATOR_ALERT_SEVERITY = 'CRITICAL';
const DISCORD_DESCRIPTION_EMPTY = '';

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function uniq(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export function durableOperatorAlertTargets(config = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return uniq([
    artifacts.pipeline_dir ? path.join(artifacts.pipeline_dir, OPERATOR_ALERTS_JSONL) : null,
    artifacts.run_log_dir ? path.join(artifacts.run_log_dir, OPERATOR_ALERTS_JSONL) : null,
  ]);
}

function sanitizePresentation(presentation = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!presentation), () => (typeof presentation !== 'object'))), () => (Array.isArray(presentation)))) return {};
  const out = sanitizeTelemetryPayload(presentation);
  if (presentation.discord && typeof presentation.discord === 'object') {
    const discord = presentation.discord;
    if (Array.isArray(discord.embeds) && discord.embeds.length) {
      out.discord = {
        ...out.discord,
        embeds: arrayValue(sanitizeDiscordMessage({ embeds: discord.embeds }).embeds),
      };
    } else {
      const sanitized = selectDefinedValue(() => (sanitizeDiscordMessage({
    embeds: [{
            title: discord.title,
            description: discord.description,
            fields: Array.isArray(discord.fields) ? discord.fields : [],
        }],
}).embeds?.[0]), () => ({}));
      out.discord = {
        ...out.discord,
        title: selectTruthyValue(() => (sanitized.title), () => (null)),
        description: selectPresentValue(sanitized.description, DISCORD_DESCRIPTION_EMPTY),
        fields: arrayValue(sanitized.fields),
      };
    }
  }
  return out;
}

function inferSeverity(options = {}, presentation = {}) {
  return selectPresentValue(options.severity, presentation?.discord?.level, options.level, DURABLE_OPERATOR_ALERT_SEVERITY);
}

function buildDurableOperatorAlertRecord(config = {}, eventType, payload = {}, options = {}) {
  const runId = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (options.runId), () => (getRunId(config)))), () => (config?._runId))), () => (config?.run_id))), () => (null));
  const sanitizedPayload = sanitizeTelemetryPayload(objectRecord(payload));
  const sanitizedPresentation = sanitizePresentation(objectRecord(options.presentation));
  return {
    v: 1,
    type: selectPresentValue(eventType, DURABLE_OPERATOR_ALERT_TYPE),
    ts: durableAlertOccurredAt(options),
    project: selectTruthyValue(() => (config?.project), () => (null)),
    run_id: runId,
    severity: inferSeverity(options, sanitizedPresentation),
    source: selectPresentValue(options.source, payload?.source, DURABLE_OPERATOR_ALERT_SOURCE),
    emitter: selectPresentValue(options.emitter, payload?.emitter, DURABLE_OPERATOR_ALERT_EMITTER),
    hook_id: selectTruthyValue(() => (options.hookId), () => (null)),
    module_id: selectTruthyValue(() => (selectTruthyValue(() => (options.moduleId), () => (sanitizedPayload.module_id))), () => (null)),
    gate_id: selectTruthyValue(() => (selectTruthyValue(() => (options.gateId), () => (sanitizedPayload.gate_id))), () => (null)),
    gate_type: selectTruthyValue(() => (selectTruthyValue(() => (options.gateType), () => (sanitizedPayload.gate_type))), () => (null)),
    step_type: selectTruthyValue(() => (sanitizedPayload.step_type), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (options.attempt), () => (sanitizedPayload.attempt))), () => (null)),
    dispatch_id: selectTruthyValue(() => (sanitizedPayload.dispatch_id), () => (null)),
    gateway_label: selectTruthyValue(() => (sanitizedPayload.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (sanitizedPayload.session_key), () => (null)),
    terminal_status: selectDefinedValue(() => (sanitizedPayload.terminal_status), () => (null)),
    terminal_decision: selectDefinedValue(() => (sanitizedPayload.terminal_decision), () => (null)),
    reason: selectTruthyValue(() => (sanitizedPayload.reason), () => (null)),
    payload: sanitizedPayload,
    presentation: sanitizedPresentation,
  };
}

function durableAlertOccurredAt(options) {
  if (options.occurredAt) return options.occurredAt;
  return new Date().toISOString();
}

function reportDurableAlertWriteFailure(config = {}, target, error) {
  reportClassifiedNonBlockingError({
    log,
    reporter: 'durable-operator-alert',
    classification: 'operator_alert_append_failed',
    incidentKey: buildNonBlockingIncidentKey(
      'durable-operator-alert',
      selectTruthyValue(() => (config?.project), () => ('missing_project')),
      selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => ('missing_run_id')),
      target,
    ),
    message: `durable operator alert append failed for ${target}`,
    error,
    level: 'WARN',
  });
}

export function appendDurableOperatorAlert(config = {}, eventType, payload = {}, options = {}) {
  const targets = durableOperatorAlertTargets(config);
  if (!targets.length) return { ok: true, skipped: true, targets: [], record: null, errors: [] };

  const record = buildDurableOperatorAlertRecord(config, eventType, payload, options);
  const line = `${JSON.stringify(record)}\n`;
  const errors = [];

  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, line);
    } catch (error) {
      errors.push({ target, error });
      reportDurableAlertWriteFailure(config, target, error);
    }
  }

  return {
    ok: errors.length === 0,
    skipped: false,
    targets,
    record,
    errors,
  };
}
