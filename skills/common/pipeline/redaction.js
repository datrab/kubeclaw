import crypto from 'crypto';
import fs from 'fs';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from './noncritical-reporting.js';

const SECRET_PATTERNS = [
  /(sk-(?:ant|proj|live|test|app|api)[A-Za-z0-9_\-]{12,})/gi,
  /(ghp_[A-Za-z0-9]{20,})/gi,
  /(github_pat_[A-Za-z0-9_]{20,})/gi,
  /(xox[baprs]-[A-Za-z0-9-]{10,})/gi,
  /(Bearer\s+[A-Za-z0-9._~+/=-]{12,})/gi,
  /((?:api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*)([^\s,'"`]+)/gi,
];

const SENSITIVE_CONTENT_KEYS = /(?:^|_)(?:prompt|instructions?|transcript|payload|content|text|raw|body)$/i;
const SECRET_KEYS = /(?:token|secret|password|authorization|api[_-]?key|cookie|oauth)/i;
const SAFE_IDENTIFIER_KEYS = new Set([
  'run_id',
  'module_id',
  'gate_id',
  'session_key',
  'attempt',
  'project',
  'task_type',
  'model',
  'runtime',
  'label',
  'agent_type',
  'output_file',
  'instructions_file',
  'module_path',
  'status_json_path',
]);

const TRANSCRIPT_HEAD_EVENTS = 80;
const TRANSCRIPT_TAIL_EVENTS = 40;

function normalizeString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

export function shortHash(value) {
  return crypto.createHash('sha256').update(normalizeString(value)).digest('hex').slice(0, 16);
}

export function redactSecrets(value, maxChars = 1200) {
  let text = normalizeString(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...args) => {
      if (args.length >= 3 && /[:=]\s*$/.test(args[1] || '')) return `${args[1]}[redacted-secret]`;
      return '[redacted-secret]';
    });
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

export function buildRedactionMarker(value, label = 'content') {
  const text = normalizeString(value);
  const lines = text ? text.split(/\r?\n/).length : 0;
  return `[redacted ${label}; chars=${text.length}; lines=${lines}; sha256=${shortHash(text)}]`;
}

function pickSafeIdentifiers(value, identifiers = {}) {
  if (!value || typeof value !== 'object') return identifiers;
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) continue;
    if (SAFE_IDENTIFIER_KEYS.has(key) && identifiers[key] == null) {
      identifiers[key] = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? raw
        : redactSecrets(JSON.stringify(raw), 160);
      continue;
    }
    if (typeof raw === 'object') pickSafeIdentifiers(raw, identifiers);
  }
  return identifiers;
}

export function summarizeStructuredValue(value, label = 'payload') {
  const json = JSON.stringify(value ?? null);
  const objectValue = value && typeof value === 'object' ? value : null;
  const keys = objectValue && !Array.isArray(objectValue) ? Object.keys(objectValue).slice(0, 12) : [];
  const summary = {
    redacted: true,
    label,
    value_type: Array.isArray(value) ? 'array' : typeof value,
    json_bytes: Buffer.byteLength(json || '', 'utf8'),
    sha256: shortHash(json || ''),
  };
  if (keys.length > 0) summary.keys = keys;
  if (Array.isArray(value)) summary.item_count = value.length;
  const identifiers = pickSafeIdentifiers(value);
  if (Object.keys(identifiers).length > 0) summary.identifiers = identifiers;
  return summary;
}

export function formatSummaryForDiscord(summary, maxChars = 900) {
  const text = JSON.stringify(summary, null, 2);
  return text.length <= maxChars ? `\`\`\`json\n${text}\n\`\`\`` : `\`\`\`json\n${text.slice(0, maxChars - 1)}…\n\`\`\``;
}

export function sanitizeTelemetryPayload(payload = {}) {
  function walk(value, key = '') {
    if (value == null) return value;

    if (typeof value === 'string') {
      if (SECRET_KEYS.test(key)) return '[redacted-secret]';
      if (SENSITIVE_CONTENT_KEYS.test(key)) return buildRedactionMarker(value, key);
      return redactSecrets(value, 500);
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      return value.map((item) => walk(item));
    }

    if (typeof value === 'object') {
      if (SECRET_KEYS.test(key)) return '[redacted-secret]';
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      const out = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        out[childKey] = walk(childValue, childKey);
      }
      return out;
    }

    return value;
  }

  return walk(payload);
}

export function sanitizeDiscordMessage(message = {}) {
  const sanitizeFieldValue = (value, label = 'field') => {
    if (value == null) return '—';
    if (typeof value === 'string') {
      return SENSITIVE_CONTENT_KEYS.test(label)
        ? buildRedactionMarker(value, label)
        : redactSecrets(value, 900);
    }
    if (typeof value === 'object') {
      return formatSummaryForDiscord(summarizeStructuredValue(value, label));
    }
    return redactSecrets(String(value), 900);
  };

  const sanitizeEmbed = (embed = {}) => ({
    ...embed,
    title: embed.title ? redactSecrets(embed.title, 240) : embed.title,
    description: embed.description ? redactSecrets(embed.description, 1400) : embed.description,
    fields: Array.isArray(embed.fields)
      ? embed.fields.slice(0, 20).map((field = {}) => ({
          ...field,
          name: redactSecrets(field.name || 'Field', 250),
          value: sanitizeFieldValue(field.value, field.name || 'field'),
        }))
      : undefined,
    footer: embed.footer?.text ? { ...embed.footer, text: redactSecrets(embed.footer.text, 200) } : embed.footer,
  });

  return {
    content: message.content ? redactSecrets(message.content, 1800) : undefined,
    embeds: Array.isArray(message.embeds) ? message.embeds.map(sanitizeEmbed) : undefined,
    files: [],
  };
}

export function summarizePayloadForDiscord(payload, label = 'payload') {
  return {
    ...summarizeStructuredValue(payload, label),
    redacted_preview: buildRedactionMarker(JSON.stringify(payload ?? null), label),
  };
}

export function writeRedactedPromptArtifact(filePath, prompt, meta = {}) {
  const text = normalizeString(prompt);
  const content = [
    '# Redacted prompt artifact',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| redacted | true |`,
    `| chars | ${text.length} |`,
    `| lines | ${text ? text.split(/\r?\n/).length : 0} |`,
    `| sha256 | ${shortHash(text)} |`,
    ...Object.entries(meta)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `| ${key} | ${redactSecrets(value, 240)} |`),
    '',
    '_Prompt content omitted by default for secret hygiene._',
    '',
  ].join('\n');
  fs.writeFileSync(filePath, content);
}

function summarizeTranscriptEvent(line, index) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    reportClassifiedNonBlockingError({
      reporter: 'redaction',
      classification: 'transcript_event_parse_failed',
      incidentKey: buildNonBlockingIncidentKey('redaction', 'transcript_event_parse_failed'),
      message: 'Failed to parse transcript event for redacted summary; falling back to raw line metadata',
      error,
      level: 'DEBUG',
      fallback: (_level, output) => process.stderr.write(`${output}\n`),
    });
  }
  const text = parsed?.text ?? parsed?.data?.text ?? line;
  return {
    index,
    ts: parsed?.ts || null,
    kind: parsed?.kind || 'info',
    phase: parsed?.phase || null,
    offset: parsed?.offset ?? null,
    redacted: true,
    text_chars: normalizeString(text).length,
    text_sha256: shortHash(text),
  };
}

export function copyRedactedTranscriptArtifact(sourcePath, destPath) {
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const keep = [];
  for (let i = 0; i < Math.min(lines.length, TRANSCRIPT_HEAD_EVENTS); i++) keep.push(i);
  const tailStart = Math.max(TRANSCRIPT_HEAD_EVENTS, lines.length - TRANSCRIPT_TAIL_EVENTS);
  for (let i = tailStart; i < lines.length; i++) keep.push(i);
  const uniqueIndexes = [...new Set(keep)].sort((a, b) => a - b);
  const summary = {
    type: 'transcript.summary',
    redacted: true,
    total_events: lines.length,
    stored_events: uniqueIndexes.length,
    truncated: uniqueIndexes.length < lines.length,
    sha256: shortHash(lines.join('\n')),
  };
  const output = [JSON.stringify(summary)];
  for (const index of uniqueIndexes) {
    output.push(JSON.stringify(summarizeTranscriptEvent(lines[index], index)));
  }
  fs.writeFileSync(destPath, `${output.join('\n')}\n`);
}
