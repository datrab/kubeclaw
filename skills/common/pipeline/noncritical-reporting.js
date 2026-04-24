const _reportedNonBlockingIncidents = new Set();

export function buildNonBlockingIncidentKey(...parts) {
  return parts
    .flat(Infinity)
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part))
    .join(':');
}

export function normalizeNonBlockingErrorDetail(error) {
  if (!error) return null;
  if (typeof error === 'string') {
    const text = error.trim();
    return text || null;
  }
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error?.code === 'string' && error.code.trim()) return `code=${error.code.trim()}`;
  if (typeof error?.status === 'number') return `status=${error.status}`;
  try {
    const json = JSON.stringify(error);
    return json && json !== '{}' ? json : null;
  } catch (_error) {
    return null;
  }
}

export function reportClassifiedNonBlockingError({
  reporter = 'pipeline',
  classification = 'noncritical_error',
  incidentKey = null,
  message = classification,
  error = null,
  includeErrorDetail = true,
  level = 'WARN',
  log = null,
  fallback = null,
} = {}) {
  const resolvedKey = incidentKey || buildNonBlockingIncidentKey(reporter, classification, message);
  if (!resolvedKey) return false;
  if (_reportedNonBlockingIncidents.has(resolvedKey)) return false;
  _reportedNonBlockingIncidents.add(resolvedKey);

  const detail = includeErrorDetail ? normalizeNonBlockingErrorDetail(error) : null;
  const line = detail
    ? `[${reporter}] ${message} (classification=${classification}): ${detail}`
    : `[${reporter}] ${message} (classification=${classification})`;

  if (typeof log === 'function') {
    log(level, line);
    return true;
  }

  if (typeof fallback === 'function') {
    fallback(level, line);
    return true;
  }

  try {
    process.stderr.write(`${line}\n`);
    return true;
  } catch (_error) {
    return false;
  }
}
