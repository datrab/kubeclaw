// services/durable-operator-alert.js — local-first durable operator alert evidence.
// Writes synchronously to local JSONL artifacts before network/sink delivery.

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { getRunId } from '../core/runtime.ts';
import { sanitizeDiscordMessage, sanitizeTelemetryPayload } from '../redaction.ts';
import {
  buildNonBlockingIncidentKey,
  reportClassifiedNonBlockingError,
} from '../noncritical-reporting.ts';

const OPERATOR_ALERTS_JSONL = 'operator-alerts.jsonl';

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
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) return {};
  const out = sanitizeTelemetryPayload(presentation);
  if (presentation.discord && typeof presentation.discord === 'object') {
    const discord = presentation.discord;
    if (Array.isArray(discord.embeds) && discord.embeds.length) {
      out.discord = {
        ...out.discord,
        embeds: sanitizeDiscordMessage({ embeds: discord.embeds }).embeds || [],
      };
    } else {
      const sanitized = sanitizeDiscordMessage({
        embeds: [{
          title: discord.title,
          description: discord.description,
          fields: Array.isArray(discord.fields) ? discord.fields : [],
        }],
      }).embeds?.[0] || {};
      out.discord = {
        ...out.discord,
        title: sanitized.title || null,
        description: sanitized.description || '',
        fields: sanitized.fields || [],
      };
    }
  }
  return out;
}

function inferSeverity(options = {}, presentation = {}) {
  return options.severity || presentation?.discord?.level || options.level || 'CRITICAL';
}

function buildDurableOperatorAlertRecord(config = {}, eventType, payload = {}, options = {}) {
  const runId = options.runId || getRunId(config) || config?._runId || config?.run_id || null;
  const sanitizedPayload = sanitizeTelemetryPayload(payload || {});
  const sanitizedPresentation = sanitizePresentation(options.presentation || {});
  return {
    v: 1,
    type: eventType || 'pipeline.operator_alert',
    ts: options.occurredAt || new Date().toISOString(),
    project: config?.project || null,
    run_id: runId,
    severity: inferSeverity(options, sanitizedPresentation),
    source: options.source || payload?.source || 'pipeline',
    emitter: options.emitter || payload?.emitter || 'nova/pipeline/services/durable-operator-alert',
    hook_id: options.hookId || null,
    module_id: options.moduleId || sanitizedPayload.module_id || null,
    gate_id: options.gateId || sanitizedPayload.gate_id || null,
    gate_type: options.gateType || sanitizedPayload.gate_type || null,
    step_type: sanitizedPayload.step_type || null,
    attempt: options.attempt ?? sanitizedPayload.attempt ?? null,
    dispatch_id: sanitizedPayload.dispatch_id || null,
    gateway_label: sanitizedPayload.gateway_label || null,
    session_key: sanitizedPayload.session_key || null,
    terminal_status: sanitizedPayload.terminal_status ?? null,
    terminal_decision: sanitizedPayload.terminal_decision ?? null,
    reason: sanitizedPayload.reason || null,
    payload: sanitizedPayload,
    presentation: sanitizedPresentation,
  };
}

function reportDurableAlertWriteFailure(config = {}, target, error) {
  reportClassifiedNonBlockingError({
    log,
    reporter: 'durable-operator-alert',
    classification: 'operator_alert_append_failed',
    incidentKey: buildNonBlockingIncidentKey(
      'durable-operator-alert',
      config?.project || 'unknown',
      config?._runId || config?.run_id || 'unknown',
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
