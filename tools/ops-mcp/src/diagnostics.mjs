// Technical byte limits only: never classify or redact application content.
export function boundedUtf8(text, limit) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return { text, truncated: false };
  let end = limit;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

export function logObservation(raw, { sinceTime, tailLines }) {
  const { text, truncated } = boundedUtf8(raw, 64 * 1024);
  const lines = text.split('\n').filter(Boolean);
  const timestamp = line => /^\d{4}-\d\d-\d\dT\S+/.exec(line ?? '')?.[0] ?? null;
  const lineLimitReached = tailLines !== undefined && lines.length >= tailLines;
  return {
    text,
    byteLimited: truncated,
    lineLimitReached,
    coverage: 'available-container-log-only',
    historicalCompleteness: 'unknown',
    firstReturnedTime: timestamp(lines[0]),
    lastReturnedTime: timestamp(lines.at(-1)),
    requestedSinceTime: sinceTime ?? null,
    continuation: truncated
      ? 'Request sinceTime at the last returned timestamp without tailLines; overlap and inspect for duplicates. A single oversized line or multiple entries at one timestamp may prevent progress; no lossless cursor is promised.'
      : 'Use an older sinceTime without tailLines for older still available data, or inspect another container/pod. previous=true selects the previous container instance where available.',
    retention: 'Rotated/deleted logs may be unavailable. Kubernetes has no until or historical page cursor; an empty response does not prove historical coverage.',
  };
}
