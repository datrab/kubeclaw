import { sanitizeDiscordMessage } from '../egress.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export type AnyRecord = Record<string, any>;
export type DiscordLevel = keyof typeof DISCORD_LEVEL_STYLE;
const DISCORD_LEVEL_STYLE = Object.freeze({
  INFO: { icon: 'ℹ️', color: 0x3498db },
  WARN: { icon: '⚠️', color: 0xe67e22 },
  CRITICAL: { icon: '🚨', color: 0xe74c3c },
  OK: { icon: '✅', color: 0x2ecc71 },
  DEBUG: { icon: 'ℹ️', color: 0x95a5a6 },
});

const DISCORD_LEVELS = new Set(Object.keys(DISCORD_LEVEL_STYLE));
const DISCORD_PAYLOAD_LIMITS = Object.freeze({
  embeds: 10,
  fields: 25,
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  embedTotal: 6000,
});

export function isPlainRecord(value: any) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function recordOrEmpty(value: any): AnyRecord {
  return isPlainRecord(value) ? value as AnyRecord : {};
}

export function arrayOrEmpty(value: any) {
  return Array.isArray(value) ? value : [];
}

export function optionalText(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  return String(value);
}

export function textOrEmpty(value: any): string {
  return optionalText(value) ?? '';
}

export function requiredText(value: any, label: any) {
  const text = optionalText(value)?.trim();
  if (!text) throw new Error(`${label}: required non-empty string`);
  return text;
}

export function requiredBoolean(value: any, label: any) {
  if (typeof value !== 'boolean') throw new Error(`${label}: required boolean`);
  return value;
}

export function normalizedFieldName(value: any) {
  return textOrEmpty(value).trim().toLowerCase();
}

export function normalizeDiscordLevel(value: any, label: any = 'discord.level'): DiscordLevel {
  const level = requiredText(value, label).toUpperCase();
  if (!DISCORD_LEVELS.has(level)) {
    throw new Error(`${label}: unsupported Discord level '${level}'`);
  }
  return level as DiscordLevel;
}

export function discordStyle(level: DiscordLevel) {
  const style = DISCORD_LEVEL_STYLE[level];
  if (!style) throw new Error(`discord.level: style missing for '${level}'`);
  return style;
}

export function requireSanitizedEmbeds(payload: any, label: any) {
  const embeds = payload?.embeds;
  if (selectTruthyValue(() => (!Array.isArray(embeds)), () => (!embeds.length))) {
    throw new Error(`${label}: sanitizer did not return Discord embeds`);
  }
  return embeds;
}

function discordPayloadLimitError(label: any, detail: any) {
  const error: any = new Error(`${label}: ${detail}`);
  error.code = 'DISCORD_PAYLOAD_INVALID';
  error.bodyPreview = detail;
  return error;
}

function assertTextLimit(value: any, max: any, label: any) {
  const text = optionalText(value);
  if (text !== null && text.length > max) {
    throw discordPayloadLimitError('discord.payload', `${label} length ${text.length} exceeds ${max}`);
  }
  return text ? text.length : 0;
}

export function assertDiscordPayloadWithinLimits(payload: any = {}, label: any = 'discord.payload') {
  const embeds = arrayOrEmpty(payload.embeds);
  if (embeds.length > DISCORD_PAYLOAD_LIMITS.embeds) {
    throw discordPayloadLimitError(label, `embeds count ${embeds.length} exceeds ${DISCORD_PAYLOAD_LIMITS.embeds}`);
  }
  for (const [index, embed] of embeds.entries()) {
    const embedRecord = recordOrEmpty(embed);
    const fields = arrayOrEmpty(embedRecord.fields);
    if (fields.length > DISCORD_PAYLOAD_LIMITS.fields) {
      throw discordPayloadLimitError(label, `embeds.${index}.fields count ${fields.length} exceeds ${DISCORD_PAYLOAD_LIMITS.fields}`);
    }
    let total = 0;
    total += assertTextLimit(embedRecord.title, DISCORD_PAYLOAD_LIMITS.title, `embeds.${index}.title`);
    total += assertTextLimit(embedRecord.description, DISCORD_PAYLOAD_LIMITS.description, `embeds.${index}.description`);
    total += assertTextLimit(recordOrEmpty(embedRecord.footer).text, DISCORD_PAYLOAD_LIMITS.footerText, `embeds.${index}.footer.text`);
    for (const [fieldIndex, field] of fields.entries()) {
      const fieldRecord = recordOrEmpty(field);
      total += assertTextLimit(fieldRecord.name, DISCORD_PAYLOAD_LIMITS.fieldName, `embeds.${index}.fields.${fieldIndex}.name`);
      total += assertTextLimit(fieldRecord.value, DISCORD_PAYLOAD_LIMITS.fieldValue, `embeds.${index}.fields.${fieldIndex}.value`);
    }
    if (total > DISCORD_PAYLOAD_LIMITS.embedTotal) {
      throw discordPayloadLimitError(label, `embeds.${index} text length ${total} exceeds ${DISCORD_PAYLOAD_LIMITS.embedTotal}`);
    }
  }
}

function truncateDiscordText(value: any, max: any, marker: any = '…') {
  const text = textOrEmpty(value);
  if (text.length <= max) return text;
  if (max <= marker.length) return marker.slice(0, Math.max(0, max));
  return `${text.slice(0, max - marker.length)}${marker}`;
}

function compactDiscordEmbed(embed: any = {}) {
  const embedRecord = recordOrEmpty(embed);
  const compact: AnyRecord = {
    ...embedRecord,
    title: truncateDiscordText(embedRecord.title, DISCORD_PAYLOAD_LIMITS.title),
    description: truncateDiscordText(embedRecord.description, DISCORD_PAYLOAD_LIMITS.description),
    footer: embedRecord.footer ? {
      ...recordOrEmpty(embedRecord.footer),
      text: truncateDiscordText(recordOrEmpty(embedRecord.footer).text, DISCORD_PAYLOAD_LIMITS.footerText),
    } : embedRecord.footer,
    fields: [],
  };
  const maxTotal = DISCORD_PAYLOAD_LIMITS.embedTotal - 100;
  let total = textOrEmpty(compact.title).length
    + textOrEmpty(compact.description).length
    + textOrEmpty(recordOrEmpty(compact.footer).text).length;
  for (const rawField of arrayOrEmpty(embedRecord.fields).slice(0, DISCORD_PAYLOAD_LIMITS.fields)) {
    const name = truncateDiscordText(recordOrEmpty(rawField).name || 'Field', DISCORD_PAYLOAD_LIMITS.fieldName);
    const remaining = maxTotal - total - name.length;
    if (remaining <= 16) break;
    const value = truncateDiscordText(
      recordOrEmpty(rawField).value || '—',
      Math.min(DISCORD_PAYLOAD_LIMITS.fieldValue, remaining),
    ) || '—';
    compact.fields.push({ ...recordOrEmpty(rawField), name, value, inline: recordOrEmpty(rawField).inline === true });
    total += name.length + value.length;
  }
  return compact;
}

export function buildCanonicalDiscordPayload(embed: any = {}) {
  const payload = sanitizeDiscordMessage({
    embeds: [compactDiscordEmbed(embed)],
  });
  assertDiscordPayloadWithinLimits(payload, 'discord.embed');
  return payload;
}

export function emptyDiscordCorrelation() {
  return {
    run_id: null,
    session_key: null,
    gateway_label: null,
    attempt: null,
    module_id: null,
    gate_id: null,
    gate_type: null,
    dispatch_id: null,
  };
}

function normalizeAttempt(value: any) {
  if (selectTruthyValue(() => (value == null), () => (value === ''))) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function discordWebhookTimeoutMs(config: any) {
  const timeoutMs = Number(config?.discord?.webhook_timeout_ms);
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('config.discord.webhook_timeout_ms: required positive integer in swarm.config.json');
  }
  return timeoutMs;
}

export function discordReceiptWebhookUrl(value: any) {
  const url = new URL(requiredText(value, 'config.discord_webhook_url'));
  url.searchParams.set('wait', 'true');
  return url.toString();
}

export function normalizeDiscordCorrelation(source: any = {}) {
  const record = recordOrEmpty(source);
  return {
    run_id: optionalText(record.run_id),
    session_key: optionalText(record.session_key),
    gateway_label: optionalText(record.gateway_label),
    attempt: normalizeAttempt(record.attempt),
    module_id: optionalText(record.module_id),
    gate_id: optionalText(record.gate_id),
    gate_type: optionalText(record.gate_type),
    dispatch_id: optionalText(record.dispatch_id),
  };
}

export function mergeDiscordCorrelation(base: any = {}, extra: any = {}) {
  const normalizedBase = normalizeDiscordCorrelation(base);
  const normalizedExtra = normalizeDiscordCorrelation(extra);
  return {
    run_id: selectDefinedValue(() => (normalizedExtra.run_id), () => (normalizedBase.run_id)),
    session_key: selectDefinedValue(() => (normalizedExtra.session_key), () => (normalizedBase.session_key)),
    gateway_label: selectDefinedValue(() => (normalizedExtra.gateway_label), () => (normalizedBase.gateway_label)),
    attempt: selectDefinedValue(() => (normalizedExtra.attempt), () => (normalizedBase.attempt)),
    module_id: selectDefinedValue(() => (normalizedExtra.module_id), () => (normalizedBase.module_id)),
    gate_id: selectDefinedValue(() => (normalizedExtra.gate_id), () => (normalizedBase.gate_id)),
    gate_type: selectDefinedValue(() => (normalizedExtra.gate_type), () => (normalizedBase.gate_type)),
    dispatch_id: selectDefinedValue(() => (normalizedExtra.dispatch_id), () => (normalizedBase.dispatch_id)),
  };
}
