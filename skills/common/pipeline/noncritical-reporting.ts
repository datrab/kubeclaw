import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
declare const process: {
  stderr: { write(text: string): void };
};

const _reportedNonBlockingIncidents = new Set<string>();

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

type IncidentDelivery = {
  log: IncidentOutput | null;
  fallback: IncidentOutput | null;
  level: string;
  line: string;
};

function readStringProperty(value: unknown, key: string) {
  if (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : null;
}

function readNumberProperty(value: unknown, key: string) {
  if (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))) return null;
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

export function sanitizeNonBlockingErrorDetail(value: unknown, maxChars = 1200) {
  let text = typeof value === 'string' ? value : String(value == null ? '' : value);
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
    return selectTruthyValue(() => (text), () => (null));
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
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
    return null;
  }
}

function incidentLine(
  reporter: string,
  classification: string,
  message: string,
  detail: string | null,
): string {
  const prefix = `[${reporter}] ${message} (classification=${classification})`;
  return detail ? `${prefix}: ${detail}` : prefix;
}

function deliverIncident({ log, fallback, level, line }: IncidentDelivery): boolean {
  if (log && writeIncidentOutput(log, level, line)) return true;
  if (fallback && writeIncidentOutput(fallback, level, line)) return true;
  try {
    process.stderr.write(`${line}\n`);
    return true;
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): every configured noncritical reporting channel has failed. */
    return false;
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
  const resolvedMessage = nonCriticalMessageAuthority(message, classification);
  const resolvedKey = nonCriticalIncidentKeyAuthority(incidentKey, reporter, classification, resolvedMessage);
  if (!resolvedKey) return false;
  if (_reportedNonBlockingIncidents.has(resolvedKey)) return false;

  const detail = includeErrorDetail ? normalizeNonBlockingErrorDetail(error) : null;
  const line = incidentLine(reporter, classification, resolvedMessage, detail);
  const delivered = deliverIncident({ log, fallback, level, line });
  if (delivered) _reportedNonBlockingIncidents.add(resolvedKey);
  return delivered;
}

function nonCriticalMessageAuthority(message: string | undefined, classification: string): string {
  if (message !== undefined && message !== null) return message;
  return classification;
}

function nonCriticalIncidentKeyAuthority(
  incidentKey: string | null,
  reporter: string,
  classification: string,
  resolvedMessage: string,
): string {
  if (incidentKey) return incidentKey;
  return buildNonBlockingIncidentKey(reporter, classification, resolvedMessage);
}
