import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { resolveDiscordWebhookUrl } from './runtime.js';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from '../../../common/pipeline/noncritical-reporting.js';
import { sanitizeDiscordMessage } from '../../../common/pipeline/redaction.js';

function reportBusterDiscordIncident(context = {}, classification, error, message, options = {}) {
  reportClassifiedNonBlockingError({
    reporter: 'buster-discord',
    classification,
    incidentKey: buildNonBlockingIncidentKey(
      'buster-discord',
      context?.project || 'unknown',
      context?.runId || context?.run_id || 'unknown',
      context?.moduleId || context?.module_id || 'global',
      classification,
      options.scope || 'global'
    ),
    message,
    error,
    includeErrorDetail: options.includeErrorDetail ?? true,
    level: options.level || 'WARN',
    fallback: (_level, line) => process.stderr.write(`${line}\n`),
  });
}

function normalizeIdentity(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeAttempt(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : normalizeIdentity(value);
}

function normalizeMessage(message) {
  return sanitizeDiscordMessage(
    (message?.embeds || message?.content || message?.files)
      ? {
          content: message.content || undefined,
          embeds: Array.isArray(message.embeds) ? message.embeds : undefined,
          files: [],
        }
      : { content: undefined, embeds: [message], files: [] }
  );
}

function buildCorrelationContext(context = {}) {
  return {
    module_id: normalizeIdentity(context.moduleId ?? context.module_id),
    gate_id: normalizeIdentity(context.gateId ?? context.gate_id),
    project: normalizeIdentity(context.project),
    run_id: normalizeIdentity(context.runId ?? context.run_id),
    attempt: normalizeAttempt(context.attempt),
    dispatch_id: normalizeIdentity(context.dispatchId ?? context.dispatch_id),
    session_key: normalizeIdentity(context.sessionKey ?? context.session_key),
    log_dir: normalizeIdentity(context.logDir ?? context.log_dir),
    webhook_url: resolveDiscordWebhookUrl(context.webhookUrl ?? context.webhook_url ?? null),
  };
}

function existingFieldNames(embed = {}) {
  return new Set((embed.fields || []).map((field) => String(field?.name || '').trim().toLowerCase()));
}

function appendCorrelationFields(embed = {}, correlation = {}) {
  const fields = Array.isArray(embed.fields) ? [...embed.fields] : [];
  const names = existingFieldNames(embed);

  if (correlation.run_id && !names.has('run') && !names.has('run id') && !names.has('run_id')) {
    fields.push({ name: 'Run', value: `\`${correlation.run_id}\``, inline: true });
  }
  if (correlation.attempt != null && !names.has('attempt')) {
    fields.push({ name: 'Attempt', value: `\`${correlation.attempt}\``, inline: true });
  }
  if (correlation.dispatch_id && !names.has('dispatch')) {
    fields.push({ name: 'Dispatch', value: `\`${correlation.dispatch_id}\``, inline: true });
  }
  if (correlation.gate_id && !names.has('gate')) {
    fields.push({ name: 'Gate', value: `\`${correlation.gate_id}\``, inline: true });
  }
  if (correlation.session_key && !names.has('session')) {
    fields.push({ name: 'Session', value: `\`${correlation.session_key}\``, inline: false });
  }

  return { ...embed, fields };
}

function persistDiscordArtifact(payload, correlation) {
  if (!correlation.log_dir) return;
  try {
    fs.mkdirSync(correlation.log_dir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      channel: 'discord',
      module_id: correlation.module_id,
      gate_id: correlation.gate_id,
      project: correlation.project,
      run_id: correlation.run_id,
      attempt: correlation.attempt,
      dispatch_id: correlation.dispatch_id,
      session_key: correlation.session_key,
      payload,
    };
    fs.appendFileSync(path.join(correlation.log_dir, 'discord.jsonl'), JSON.stringify(entry) + '\n');
  } catch (error) {
    reportBusterDiscordIncident(correlation, 'artifact_write_failed', error, 'Buster Discord artifact write failed', {
      level: 'DEBUG',
      scope: 'artifact',
    });
  }
}

function discordWebhookDeliveryMuted(context = {}) {
  if (context?._disable_discord_webhooks || context?.disable_discord_webhooks) return true;
  const env = String(process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS || '').trim().toLowerCase();
  return env === '1' || env === 'true' || env === 'yes';
}

export function sendDiscord(message, context = {}) {
  if (!message) return null;

  const correlation = buildCorrelationContext(context);
  const normalized = normalizeMessage(message);
  const payload = {
    content: normalized.content,
    embeds: (normalized.embeds || []).map((embed) => appendCorrelationFields(embed, correlation)),
  };

  persistDiscordArtifact(payload, correlation);

  if (discordWebhookDeliveryMuted(context)) return payload;
  if (!correlation.webhook_url) return payload;

  try {
    execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify(payload), correlation.webhook_url], {
      stdio: 'ignore',
      timeout: 10000,
    });
  } catch (error) {
    reportBusterDiscordIncident(correlation, 'webhook_delivery_failed', error, 'Buster Discord webhook delivery failed', {
      scope: 'webhook',
    });
  }

  return payload;
}
