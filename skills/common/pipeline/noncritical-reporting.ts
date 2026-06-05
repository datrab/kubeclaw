// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import crypto from 'crypto';

declare const process: {
  stderr: { write(text: string): void };
};

const _reportedNonBlockingIncidents = new Set<string>();

const SECRET_PATTERNS = [
  /(sk-(?:ant|proj|live|test|app|api)[A-Za-z0-9_\-]{12,})/gi,
  /(ghp_[A-Za-z0-9]{20,})/gi,
  /(github_pat_[A-Za-z0-9_]{20,})/gi,
  /(xox[baprs]-[A-Za-z0-9-]{10,})/gi,
  /(Bearer\s+[A-Za-z0-9._~+/=-]{12,})/gi,
  /((?:api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*)([^\s,'"`]+)/gi,
];

type IncidentOutput = (level: string, line: string) => void;

type ClassifiedNonBlockingErrorOptions = {
  reporter?: string;
  classification?: string;
  incidentKey?: string | null;
  message?: string;
  error?: unknown;
  includeErrorDetail?: boolean;
  level?: string;
  log?: IncidentOutput | null;
  fallback?: IncidentOutput | null;
};

function readStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : null;
}

function readNumberProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' ? candidate : null;
}

function writeIncidentOutput(output: IncidentOutput, level: string, line: string) {
  try {
    output(level, line);
    return true;
  } catch (_error) {
    return false;
  }
}

function shortSecretFingerprint(value: unknown) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 12);
}

function buildSecretMarker(secret: unknown, label = 'secret') {
  const text = String(secret ?? '');
  return `[redacted-${label}; sha256=${shortSecretFingerprint(text)}; chars=${text.length}]`;
}

export function sanitizeNonBlockingErrorDetail(value: unknown, maxChars = 1200) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (...args: string[]) => {
      if (args.length >= 3 && /[:=]\s*$/.test(args[1] || '')) {
        return `${args[1]}${buildSecretMarker(args[2], 'secret')}`;
      }
      return buildSecretMarker(args[1] || args[0], 'secret');
    });
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

export function buildNonBlockingIncidentKey(...parts: unknown[]) {
  return parts
    .flat(Infinity)
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part))
    .join(':');
}

export function normalizeNonBlockingErrorDetail(error: unknown) {
  if (!error) return null;
  if (typeof error === 'string') {
    const text = sanitizeNonBlockingErrorDetail(error.trim());
    return text || null;
  }
  const message = readStringProperty(error, 'message');
  if (message?.trim()) return sanitizeNonBlockingErrorDetail(message.trim());
  const code = readStringProperty(error, 'code');
  if (code?.trim()) return `code=${sanitizeNonBlockingErrorDetail(code.trim(), 160)}`;
  const status = readNumberProperty(error, 'status');
  if (typeof status === 'number') return `status=${status}`;
  try {
    const json = JSON.stringify(error);
    return json && json !== '{}' ? sanitizeNonBlockingErrorDetail(json) : null;
  } catch (_error) {
    return null;
  }
}

export function reportClassifiedNonBlockingError({
  reporter = 'pipeline',
  classification = 'noncritical_error',
  incidentKey = null,
  message,
  error = null,
  includeErrorDetail = true,
  level = 'WARN',
  log = null,
  fallback = null,
}: ClassifiedNonBlockingErrorOptions = {}) {
  const resolvedMessage = message ?? classification;
  const resolvedKey = incidentKey || buildNonBlockingIncidentKey(reporter, classification, resolvedMessage);
  if (!resolvedKey) return false;
  if (_reportedNonBlockingIncidents.has(resolvedKey)) return false;

  const detail = includeErrorDetail ? normalizeNonBlockingErrorDetail(error) : null;
  const line = detail
    ? `[${reporter}] ${resolvedMessage} (classification=${classification}): ${detail}`
    : `[${reporter}] ${resolvedMessage} (classification=${classification})`;

  if (typeof log === 'function' && writeIncidentOutput(log, level, line)) {
    _reportedNonBlockingIncidents.add(resolvedKey);
    return true;
  }

  if (typeof fallback === 'function' && writeIncidentOutput(fallback, level, line)) {
    _reportedNonBlockingIncidents.add(resolvedKey);
    return true;
  }

  try {
    process.stderr.write(`${line}\n`);
    _reportedNonBlockingIncidents.add(resolvedKey);
    return true;
  } catch (_error) {
    return false;
  }
}
