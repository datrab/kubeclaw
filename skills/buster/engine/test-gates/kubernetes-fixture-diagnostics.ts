// Public failure evidence is allowlisted: never serialize a Pod spec or arbitrary
// API messages (which can contain credentials from command lines or probes).
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const identifier = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,253}$/u.test(value) ? value : null;
const fields = (value: unknown, names: string[]): RecordValue => {
  const input = record(value);
  return Object.fromEntries(names.map(name => [name, typeof input[name] === 'number' && Number.isFinite(input[name])
    ? input[name] : typeof input[name] === 'boolean' ? input[name] : identifier(input[name])]));
};
function state(value: unknown): RecordValue {
  const input = record(value);
  return Object.fromEntries(['waiting', 'running', 'terminated'].filter(key => input[key]).map(key => [key,
    fields(input[key], ['reason', 'exitCode', 'signal', 'startedAt', 'finishedAt'])]));
}
export function fixturePodEvidence(value: unknown): RecordValue {
  const pod = record(value); const status = record(pod.status);
  const containers = (entries: unknown) => list(entries).slice(0, 16).map(entry => {
    const container = record(entry);
    return { ...fields(container, ['name', 'ready', 'restartCount']), state: state(container.state), lastState: state(container.lastState) };
  });
  return { ...fields(pod.metadata, ['name', 'uid', 'namespace']), ...fields(status, ['phase', 'reason']),
    conditions: list(status.conditions).slice(0, 16).map(condition => fields(condition, ['type', 'status', 'reason', 'lastTransitionTime'])),
    initContainerStatuses: containers(status.initContainerStatuses), containerStatuses: containers(status.containerStatuses) };
}
export function fixtureEventEvidence(value: unknown): RecordValue {
  const event = record(value);
  return { ...fields(event, ['type', 'reason', 'count', 'firstTimestamp', 'lastTimestamp']),
    involvedObject: fields(event.involvedObject, ['kind', 'name', 'uid']) };
}
// Classify failures without publishing arbitrary subprocess stderr. Inspect causes
// because the runtime wraps kubectl failures while preserving the original error.
function readFailureReason(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError' ? 'timeout' : 'cancelled';
  for (let current = error, depth = 0; current && depth < 4; depth++) {
    if (current instanceof SyntaxError) return 'invalid-json';
    const value = record(current);
    const message = current instanceof Error ? current.message : '';
    const diagnostic = `${message} ${typeof value.stderr === 'string' ? value.stderr : ''}`;
    if (/\bForbidden\b|\b403\b/u.test(diagnostic)) return 'forbidden';
    if (/\bUnauthorized\b|\b401\b/u.test(diagnostic)) return 'unauthorized';
    if (/\bNotFound\b|\b404\b/u.test(diagnostic)) return 'not-found';
    if (value.code === 'ENOBUFS' || value.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output-limit';
    if (value.code === 'ETIMEDOUT' || value.killed === true || /\bTimeoutError\b/u.test(diagnostic)) return 'timeout';
    current = value.cause;
  }
  return 'unavailable';
}
export async function collectFixtureFailureEvidence(namespace: string, signal: AbortSignal,
  read: (args: readonly string[], signal: AbortSignal) => Promise<string>) {
  const readErrors: string[] = [];
  const get = async (resource: string, name?: string): Promise<unknown[]> => {
    try {
      signal.throwIfAborted();
      const result = record(JSON.parse(await read(['get', resource, ...(name ? [name] : ['-n', namespace]), '-o', 'json'], signal)));
      if (name) return [result];
      if (!Array.isArray(result.items)) throw new SyntaxError('Expected Kubernetes resource list');
      return result.items;
    } catch (error) { readErrors.push(`${resource}:${readFailureReason(error, signal)}`); return []; }
  };
  const pods = await get('pods');
  const events = signal.aborted ? [] : await get('events');
  const namespaceObjects = signal.aborted ? [] : await get('namespace', namespace);
  return { namespaceIdentity: namespaceObjects.length ? fields(record(namespaceObjects[0]).metadata, ['name', 'uid']) : null,
    schemaVersion: 'kubernetes-fixture-failure.v1', namespace, observedAt: new Date().toISOString(),
    pods: pods.slice(0, 16).map(fixturePodEvidence), events: events.slice(-32).map(fixtureEventEvidence), readErrors,
    truncated: pods.length > 16 || events.length > 32,
    omitted: ['pod specs', 'free-form messages', 'container logs (pending safe log-redaction policy)'] };
}
