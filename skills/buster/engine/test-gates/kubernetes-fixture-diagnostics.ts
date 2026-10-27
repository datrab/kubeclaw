// Public failure evidence never serializes Pod specs. Free-form diagnostics use the shared bounded redaction policy below.
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const identifier = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,253}$/u.test(value) ? value : null;
const fields = (value: unknown, names: string[]): RecordValue => {
  const input = record(value);
  return Object.fromEntries(names.map(name => [name, typeof input[name] === 'number' && Number.isFinite(input[name])
    ? input[name] : typeof input[name] === 'boolean' ? input[name] : identifier(input[name])]));
};
// Redact before truncating: slicing first could expose a partial credential.
export function fixtureDiagnosticText(value: unknown, privateValues: readonly string[] = []): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(/\\+(?=["'])/gu, '');
  // Credential-bearing line suffixes are private, including malformed/escaped JSON.
  text = text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gu, '[REDACTED]')
    .replace(/(\b(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=]\s*)[^\r\n]+/giu, '$1[REDACTED]')
    .replace(/(\b(?:[a-z0-9_.-]*(?:password|passwd|pwd|token|secret|api[_-]?key|credential|access[_-]?key|private[_-]?key))\b["']?\s*[:=]\s*)[^\r\n]*/giu, '$1[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/giu, '$1[REDACTED]@')
    .replace(/\b(?:Bearer|Basic|Digest)\s+[^\s,;]+/giu, 'Bearer [REDACTED]')
;
  const variants = privateValues.flatMap(secret => [secret, ...secret.split(/[\r\n]+/u)]).filter(Boolean).flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1).replace(/\\+(?=["'])/gu, ''), encodeURIComponent(secret), Buffer.from(secret).toString('base64')]);
  for (const secret of variants.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(secret.replace(/\\+(?=["'])/gu, '')).join('[REDACTED]');
  text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, '');
  return text.length > 1024 ? text.slice(0, 1024) + '[TRUNCATED]' : text;
}
function state(value: unknown, privateValues: readonly string[]): RecordValue {
  const input = record(value);
  return Object.fromEntries(['waiting', 'running', 'terminated'].filter(key => input[key]).map(key => [key,
    { ...fields(input[key], ['reason', 'exitCode', 'signal', 'startedAt', 'finishedAt']), message: fixtureDiagnosticText(record(input[key]).message, privateValues) }]));
}
// Resource-only projection of admitted values, not a full spec or capacity verdict.
function resourceEvidence(value: unknown): RecordValue {
  const input = record(value);
  return Object.fromEntries(['cpu', 'memory'].map(key => {
    const quantity = input[key];
    return [key, typeof quantity === 'string' && quantity.length <= 64 &&
      /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+|[numkKMGTP]|[KMGTPE]i)?$/u.test(quantity)
      ? quantity : typeof quantity === 'number' && Number.isFinite(quantity) && quantity >= 0 ? quantity : null];
  }));
}
function podResourceEvidence(value: unknown): RecordValue {
  const spec = record(value);
  const containers = (entries: unknown) => list(entries).slice(0, 16).map(value => {
    const container = record(value); const resources = record(container.resources);
    return { name: identifier(container.name), restartPolicy: container.restartPolicy === 'Always' ? 'Always' : null,
      requests: resourceEvidence(resources.requests), limits: resourceEvidence(resources.limits) };
  });
  return { nodeName: identifier(spec.nodeName), overhead: resourceEvidence(spec.overhead),
    containers: containers(spec.containers), initContainers: containers(spec.initContainers),
    truncated: list(spec.containers).length > 16 || list(spec.initContainers).length > 16 };
}
export function fixturePodEvidence(value: unknown, privateValues: readonly string[] = []): RecordValue {
  const pod = record(value); const status = record(pod.status);
  const containers = (entries: unknown) => list(entries).slice(0, 16).map(entry => {
    const container = record(entry);
    return { ...fields(container, ['name', 'ready', 'restartCount']), state: state(container.state, privateValues), lastState: state(container.lastState, privateValues) };
  });
  return { resources: podResourceEvidence(pod.spec), ...fields(pod.metadata, ['name', 'uid', 'namespace']), ...fields(status, ['phase', 'reason']), message: fixtureDiagnosticText(status.message, privateValues),
    conditions: list(status.conditions).slice(0, 16).map(condition => ({ ...fields(condition, ['type', 'status', 'reason', 'lastTransitionTime']), schedulerCategories: fixtureSchedulerCategories(record(condition).reason, record(condition).message), message: fixtureDiagnosticText(record(condition).message, privateValues) })),
    initContainerStatuses: containers(status.initContainerStatuses), containerStatuses: containers(status.containerStatuses) };
}
// Fixed categories are hints from scheduler diagnostics, never raw text or a
// claim that a particular PVC/node is the root cause. Unknown wording stays unknown.
export function fixtureSchedulerCategories(reason: unknown, message: unknown): string[] {
  if (reason !== 'FailedScheduling' && reason !== 'Unschedulable') return [];
  const text = typeof message === 'string' ? message.slice(0, 16384) : '';
  const rules: [string, RegExp][] = [
    ['insufficient-cpu', /\binsufficient cpu\b/iu],
    ['insufficient-memory', /\binsufficient memory\b/iu],
    ['unbound-pvc', /\bunbound immediate PersistentVolumeClaims\b/iu],
    ['volume-node-affinity', /\bvolume node affinity conflict\b/iu],
    ['node-affinity', /didn't match Pod's node affinity\/selector/iu],
    ['untolerated-taint', /\buntolerated taint\b/iu],
    ['pod-capacity', /\btoo many pods\b/iu],
  ];
  const categories = rules.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  return categories.length ? categories : ['unclassified'];
}
// Closed-vocabulary hints only; never include matched text, paths, or captures.
// These classify observed log wording, not a verified root cause.
export function fixtureInitLogCategories(value: unknown): string[] {
  const text = typeof value === 'string' ? value.slice(0, 4096) : '';
  const rules: [string, RegExp][] = [
    ['permission-denied', /\bpermission denied\b/iu],
    ['read-only-filesystem', /\bread-only file system\b/iu],
    ['no-space', /\bno space left on device\b/iu],
    ['missing-path', /\bno such file or directory\b/iu],
    ['operation-not-permitted', /\boperation not permitted\b/iu],
  ];
  const categories = rules.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  return categories.length ? categories : ['unclassified'];
}
export function fixtureEventEvidence(value: unknown, privateValues: readonly string[] = []): RecordValue {
  const event = record(value);
  return { ...fields(event, ['type', 'reason', 'count', 'firstTimestamp', 'lastTimestamp']),
    schedulerCategories: fixtureSchedulerCategories(event.reason, event.message),
    message: fixtureDiagnosticText(event.message, privateValues), involvedObject: fields(event.involvedObject, ['kind', 'name', 'uid']) };
}
// Storage evidence is structural only: never publish annotations, specs, volume
// identities, condition messages or arbitrary provisioner diagnostics.
export function fixturePvcEvidence(value: unknown): RecordValue {
  const pvc = record(value); const status = record(pvc.status);
  const phase = ['Pending', 'Bound', 'Lost'].includes(String(status.phase)) ? status.phase : null;
  return { ...fields(pvc.metadata, ['name', 'namespace']), phase,
    boundVolumePresent: typeof record(pvc.spec).volumeName === 'string' && record(pvc.spec).volumeName !== '',
    conditions: list(status.conditions).slice(0, 16).map(value => {
      const condition = record(value);
      return { type: ['Resizing', 'FileSystemResizePending'].includes(String(condition.type)) ? condition.type : 'Other',
        status: ['True', 'False', 'Unknown'].includes(String(condition.status)) ? condition.status : null };
    }) };
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
  const pvcs = signal.aborted ? [] : await get('persistentvolumeclaims');
  const namespaceObjects = signal.aborted ? [] : await get('namespace', namespace);
  // Literal env values are private even when they have innocuous names. Never
  // publish the spec itself or read Kubernetes Secret objects for diagnostics.
  const privateValues = pods.flatMap(pod => {
    const spec = record(record(pod).spec);
    return [...list(spec.containers), ...list(spec.initContainers)].flatMap(container =>
      list(record(container).env).map(env => record(env).value).filter((value): value is string => typeof value === 'string' && value.length > 0));
  });
  // Do not guess Secret values from regexes. Fixtures with unresolved private
  // sources retain structural diagnoses but explicitly withhold free-form text.
  const unresolvedPrivateSources = pods.length === 0 || readErrors.some(error => error.startsWith('pods:')) || pods.some(pod => {
    const spec = record(record(pod).spec);
    return [...list(spec.containers), ...list(spec.initContainers)].some(container => {
      const item = record(container);
      return list(item.env).some(env => record(record(env).valueFrom).secretKeyRef)
        || list(item.envFrom).some(source => record(source).secretRef);
    }) || list(spec.volumes).some(volume => {
      const item = record(volume);
      return item.secret || item.csi || list(record(item.projected).sources).some(source => record(source).secret || record(source).serviceAccountToken);
    });
  });
  const logs: RecordValue[] = [];
  let logReads = 0;
  for (const pod of pods.slice(0, 16)) {
    const name = identifier(record(record(pod).metadata).name);
    const status = record(record(pod).status);
    if (!name || !/^[a-z0-9][a-z0-9.-]*$/u.test(name)) continue;
    for (const container of [...list(status.initContainerStatuses), ...list(status.containerStatuses)]) {
      const containerName = identifier(record(container).name);
      if (!containerName || !/^[a-z0-9][a-z0-9-]*$/u.test(containerName)) continue;
      for (const previous of [false, true]) {
        if (signal.aborted || logReads >= 8) break;
        if (previous && !record(record(container).lastState).terminated) continue;
        logReads++;
        // Failed regular containers use the same closed-vocabulary hints as init
        // containers. Healthy private application logs remain unread.
        const failed = [record(container).state, record(container).lastState].some(value => {
          const exitCode = record(record(value).terminated).exitCode;
          return typeof exitCode === 'number' && Number.isInteger(exitCode) && exitCode > 0;
        });
        if (unresolvedPrivateSources && !list(status.initContainerStatuses).includes(container) && !failed) {
          logs.push({ pod: name, container: containerName, previous, text: null, omitted: 'unresolved-private-sources' });
          continue;
        }
        try {
          const output = await read(['logs', name, '-n', namespace, '-c', containerName,
            '--tail=40', '--limit-bytes=4096', '--timestamps=true', ...(previous ? ['--previous=true'] : [])], signal);
          // Kubernetes byte limiting can clip the first record mid-credential.
          // Discard that record before publishing any potentially partial value.
          const byteLimited = Buffer.byteLength(output) >= 4090;
          const completeOutput = byteLimited ? output.slice(output.indexOf('\n') + 1 || output.length) : output;
          logs.push(unresolvedPrivateSources
            ? { pod: name, container: containerName, previous, text: null, omitted: 'unresolved-private-sources',
              categories: fixtureInitLogCategories(completeOutput), truncated: byteLimited }
            : { pod: name, container: containerName, previous, text: fixtureDiagnosticText(completeOutput, privateValues), truncated: byteLimited || output.length > 1024 });
        } catch (error) { readErrors.push(`logs/${name}/${containerName}/${previous ? 'previous' : 'current'}:${readFailureReason(error, signal)}`); }
      }
    }
  }
  const podEvidence = pods.slice(0, 16).map(pod => fixturePodEvidence(pod, privateValues));
  const eventEvidence = events.slice(-32).map(event => fixtureEventEvidence(event, privateValues));
  const withholdMessages = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'message' && child !== null) (value as RecordValue)[key] = '[OMITTED: unresolved private sources]';
      else withholdMessages(child);
    }
  };
  if (unresolvedPrivateSources) { withholdMessages(podEvidence); withholdMessages(eventEvidence); }
  const evidence = { namespaceIdentity: namespaceObjects.length ? fields(record(namespaceObjects[0]).metadata, ['name', 'uid']) : null,
    schemaVersion: 'kubernetes-fixture-failure.v1', namespace, observedAt: new Date().toISOString(),
    pods: podEvidence, events: eventEvidence, persistentVolumeClaims: pvcs.slice(0, 16).map(fixturePvcEvidence), logs, readErrors, unresolvedPrivateSources,
    truncated: pods.length > 16 || events.length > 32 || pvcs.length > 16,
    logReadLimitReached: logReads >= 8, omitted: ['pod specs', 'Secret objects', 'literal env values and credential patterns'] };
  // Leave room for the provider envelope under its 128 KiB artifact ceiling.
  while (Buffer.byteLength(JSON.stringify(evidence)) > 96 * 1024) {
    evidence.truncated = true;
    if (evidence.pods.length) evidence.pods.pop();
    else if (evidence.events.length) evidence.events.pop();
    else if (evidence.logs.length) evidence.logs.pop();
    else if (evidence.persistentVolumeClaims.length) evidence.persistentVolumeClaims.pop();
    else break;
  }
  return evidence;
}
