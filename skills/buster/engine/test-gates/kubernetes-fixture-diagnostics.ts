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
export async function collectFixtureFailureEvidence(namespace: string, signal: AbortSignal,
  read: (args: readonly string[], signal: AbortSignal) => Promise<string>) {
  const readErrors: string[] = [];
  const get = async (resource: string): Promise<unknown[]> => {
    try {
      signal.throwIfAborted();
      const result = record(JSON.parse(await read(['get', resource, '-n', namespace, '-o', 'json'], signal)));
      return list(result.items);
    } catch { readErrors.push(`${resource}:${signal.aborted ? 'cancelled' : 'unavailable'}`); return []; }
  };
  const pods = await get('pods');
  const events = signal.aborted ? [] : await get('events');
  return { schemaVersion: 'kubernetes-fixture-failure.v1', namespace, observedAt: new Date().toISOString(),
    pods: pods.slice(0, 16).map(fixturePodEvidence), events: events.slice(-32).map(fixtureEventEvidence), readErrors,
    truncated: pods.length > 16 || events.length > 32,
    omitted: ['pod specs', 'free-form messages', 'container logs (pending safe log-redaction policy)'] };
}
