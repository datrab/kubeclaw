// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import crypto from 'crypto';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import { buildNonBlockingIncidentKey, reportClassifiedNonBlockingError } from './noncritical-reporting.ts';

declare const Buffer: {
  byteLength(value: string, encoding?: string): number;
};

declare const process: {
  stderr: { write(text: string): void };
};

type JsonObject = Record<string, any>;

const SECRET_PATTERNS = [
  /(sk-(?:ant|proj|live|test|app|api)[A-Za-z0-9_\-]{12,})/gi,
  /(ghp_[A-Za-z0-9]{20,})/gi,
  /(github_pat_[A-Za-z0-9_]{20,})/gi,
  /(xox[baprs]-[A-Za-z0-9-]{10,})/gi,
  /(Bearer\s+[A-Za-z0-9._~+/=-]{12,})/gi,
  /((?:api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*)([^\s,'"`]+)/gi,
];

const SENSITIVE_CONTENT_KEYS = /(?:^|_)(?:prompt|instructions?|transcript|payload|content|text|raw|body)$/i;
const SECRET_KEYS = /(?:^|[_-])(?:token|secret|password|authorization|api[_-]?keys?|cookie|oauth|bearer)(?:$|[_-])/i;
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
]);

const TRANSCRIPT_HEAD_EVENTS = 80;
const TRANSCRIPT_TAIL_EVENTS = 40;

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function normalizeKeyName(key: string) {
  return String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2');
}

function isSecretKey(key: string) {
  return SECRET_KEYS.test(normalizeKeyName(key));
}

export function shortHash(value: unknown) {
  return crypto.createHash('sha256').update(normalizeString(value)).digest('hex').slice(0, 16);
}

export function redactSecrets(value: unknown, maxChars = 1200) {
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

export function buildRedactionMarker(value: unknown, label = 'content') {
  const text = normalizeString(value);
  const lines = text ? text.split(/\r?\n/).length : 0;
  return `[redacted ${label}; chars=${text.length}; lines=${lines}; sha256=${shortHash(text)}]`;
}

function safeRead(value: any, key: string, fallback: any = null) {
  try {
    return value?.[key] ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sanitizeTranscriptDetail(value: unknown, label = 'transcript_detail') {
  try {
    if (value == null || value === '') return null;
    if (label === 'transcript_detail') return redactSecrets(value, 500);
    return buildRedactionMarker(value, label);
  } catch (error: any) {
    return `[redacted ${label}; sanitizer_error=${redactSecrets(error?.message || 'failed', 160)}]`;
  }
}

export function sanitizeAcpTranscriptEvidence(transcript: any, label = 'transcript') {
  try {
    if (transcript == null) return null;

    const valueType = Array.isArray(transcript) ? 'array' : typeof transcript;
    if (valueType !== 'object' || Array.isArray(transcript)) {
      return {
        type: 'transcript.summary',
        redacted: true,
        malformed: true,
        value_type: valueType,
        value_summary: sanitizeTranscriptDetail(transcript, label),
      };
    }

    const lastDetail = safeRead(transcript, 'lastDetail', '');
    const partialLine = safeRead(transcript, 'partialLine', '');
    const newLines = safeRead(transcript, 'newLines', []);
    const stringLines = Array.isArray(newLines) ? newLines.filter((line) => typeof line === 'string') : [];

    const summary: JsonObject = {
      type: 'transcript.summary',
      redacted: true,
      offset: finiteNumberOrNull(safeRead(transcript, 'offset')),
      byteOffset: finiteNumberOrNull(safeRead(transcript, 'byteOffset')),
      eventCount: finiteNumberOrNull(safeRead(transcript, 'eventCount')),
      lastActivityPoll: finiteNumberOrNull(safeRead(transcript, 'lastActivityPoll')),
      lastEventTs: typeof safeRead(transcript, 'lastEventTs') === 'string' ? redactSecrets(safeRead(transcript, 'lastEventTs'), 160) : null,
      hardError: safeRead(transcript, 'hardError') === true,
      rateLimited: safeRead(transcript, 'rateLimited') === true,
      terminal: safeRead(transcript, 'terminal') === true,
      new_line_count: Array.isArray(newLines) ? newLines.length : null,
      has_partial_line: normalizeString(partialLine).length > 0,
    };

    const detailSummary = sanitizeTranscriptDetail(lastDetail, 'transcript_detail');
    if (detailSummary) summary.detail_summary = detailSummary;

    const partialSummary = sanitizeTranscriptDetail(partialLine, 'transcript_partial_line');
    if (partialSummary) summary.partial_line_summary = partialSummary;

    if (stringLines.length > 0) {
      summary.new_lines_summary = buildRedactionMarker(stringLines.join('\n'), 'transcript_new_lines');
    }

    return summary;
  } catch (error: any) {
    return {
      type: 'transcript.summary',
      redacted: true,
      malformed: true,
      sanitizer_error: redactSecrets(error?.message || 'transcript sanitizer failed', 240),
    };
  }
}

function pickSafeIdentifiers(value: any, identifiers: JsonObject = {}) {
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

export function summarizeStructuredValue(value: unknown, label = 'payload') {
  let json;
  try {
    json = JSON.stringify(value ?? null);
  } catch (_error) {
    json = `[unserializable ${label}]`;
  }
  const objectValue = value && typeof value === 'object' ? value : null;
  const keys = objectValue && !Array.isArray(objectValue) ? Object.keys(objectValue).slice(0, 12) : [];
  const summary: JsonObject = {
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

export function sanitizeJsonEgress(payload: unknown = {}, label = 'egress') {
  const seen = new WeakSet();

  function walk(value: any, key = ''): any {
    if (value == null) return value;
    if (key && isSecretKey(key)) return '[redacted-secret]';

    if (typeof value === 'string') {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return buildRedactionMarker(value, key);
      return redactSecrets(value, Number.POSITIVE_INFINITY);
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();

    if (Array.isArray(value)) {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      if (seen.has(value)) return summarizeStructuredValue('[circular]', key || label);
      seen.add(value);
      const out = value.map((item) => walk(item, key));
      seen.delete(value);
      return out;
    }

    if (typeof value === 'object') {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      if (seen.has(value)) return summarizeStructuredValue('[circular]', key || label);
      seen.add(value);
      const out: JsonObject = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        out[childKey] = walk(childValue, childKey);
      }
      seen.delete(value);
      return out;
    }

    return redactSecrets(String(value), Number.POSITIVE_INFINITY);
  }

  return walk(payload, label);
}

export function sanitizeMarkdownText(markdown: unknown = '') {
  return redactSecrets(markdown, Number.POSITIVE_INFINITY);
}

export function formatSummaryForDiscord(summary: unknown, maxChars = 900) {
  const text = JSON.stringify(summary, null, 2);
  return text.length <= maxChars ? `\`\`\`json\n${text}\n\`\`\`` : `\`\`\`json\n${text.slice(0, maxChars - 1)}…\n\`\`\``;
}

export function sanitizeTelemetryPayload(payload: unknown = {}) {
  const seen = new WeakSet();

  function walk(value: any, key = ''): any {
    if (value == null) return value;
    if (key && isSecretKey(key)) return '[redacted-secret]';

    if (typeof value === 'string') {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return buildRedactionMarker(value, key);
      return redactSecrets(value, 500);
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      if (seen.has(value)) return summarizeStructuredValue('[circular]', key || 'payload');
      seen.add(value);
      const out = value.map((item) => walk(item));
      seen.delete(value);
      return out;
    }

    if (typeof value === 'object') {
      if (SENSITIVE_CONTENT_KEYS.test(key)) return summarizeStructuredValue(value, key);
      if (seen.has(value)) return summarizeStructuredValue('[circular]', key || 'payload');
      seen.add(value);
      const out: JsonObject = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        out[childKey] = walk(childValue, childKey);
      }
      seen.delete(value);
      return out;
    }

    return value;
  }

  return walk(payload);
}

export function sanitizeDiscordMessage(message: any = {}) {
  const sanitizeFieldValue = (value: unknown, label = 'field') => {
    if (value == null) return '—';
    if (isSecretKey(label)) return '[redacted-secret]';
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

  const sanitizeEmbedText = (value: unknown, maxChars: number) => {
    if (value == null) return undefined;
    return redactSecrets(String(value), maxChars);
  };

  const sanitizeEmbedObject = (value: any, stringLimits: JsonObject) => {
    if (!value || typeof value !== 'object') return undefined;
    const out: JsonObject = {};
    for (const [key, maxChars] of Object.entries(stringLimits)) {
      const sanitized = sanitizeEmbedText(value[key], maxChars as number);
      if (sanitized != null) out[key] = sanitized;
    }
    return Object.keys(out).length ? out : undefined;
  };

  const sanitizeEmbed = (embed: any = {}) => {
    const out: JsonObject = {};
    const title = sanitizeEmbedText(embed.title, 240);
    const description = sanitizeEmbedText(embed.description, 1400);
    const url = sanitizeEmbedText(embed.url, 900);
    const timestamp = sanitizeEmbedText(embed.timestamp, 80);
    const type = sanitizeEmbedText(embed.type, 80);

    if (title != null) out.title = title;
    if (description != null) out.description = description;
    if (url != null) out.url = url;
    if (timestamp != null) out.timestamp = timestamp;
    if (type != null) out.type = type;
    if (typeof embed.color === 'number' && Number.isFinite(embed.color)) out.color = embed.color;

    const footer = sanitizeEmbedObject(embed.footer, { text: 200, icon_url: 900 });
    if (footer) out.footer = footer;
    const image = sanitizeEmbedObject(embed.image, { url: 900 });
    if (image) out.image = image;
    const thumbnail = sanitizeEmbedObject(embed.thumbnail, { url: 900 });
    if (thumbnail) out.thumbnail = thumbnail;
    const author = sanitizeEmbedObject(embed.author, { name: 250, url: 900, icon_url: 900 });
    if (author) out.author = author;

    if (Array.isArray(embed.fields)) {
      out.fields = embed.fields.slice(0, 20).map((field: any = {}) => ({
        name: redactSecrets(field.name || 'Field', 250),
        value: sanitizeFieldValue(field.value, field.name || 'field'),
        inline: field.inline === true,
      }));
    }

    return out;
  };

  return {
    content: message.content ? redactSecrets(message.content, 1800) : undefined,
    embeds: Array.isArray(message.embeds) ? message.embeds.map(sanitizeEmbed) : undefined,
    files: [],
  };
}

export function summarizePayloadForDiscord(payload: unknown, label = 'payload') {
  return {
    ...summarizeStructuredValue(payload, label),
    redacted_preview: buildRedactionMarker(JSON.stringify(payload ?? null), label),
  };
}

export function writeRedactedPromptArtifact(filePath: string, prompt: unknown, meta: JsonObject = {}) {
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

function summarizeTranscriptEvent(line: string, index: number) {
  let parsed: any = null;
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
      fallback: (_level: string, output: string) => process.stderr.write(`${output}\n`),
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

export function copyRedactedTranscriptArtifact(sourcePath: string, destPath: string) {
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
