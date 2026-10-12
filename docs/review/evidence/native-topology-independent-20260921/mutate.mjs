import { registerHooks } from 'node:module';
const cases = {
  'drain-on-metadata-error': ['native-worker-ownership.ts', '    let observation: NativeWorkerResourceObservation | undefined;', '    if (errors.length) throw errors[0];\n    let observation: NativeWorkerResourceObservation | undefined;'],
  'post-bind-fence': ['native-worker-ownership.ts', "    if (this.#closing) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');\n    const child =", '    const child ='],
  'helper-serialization': ['native-worker-ownership.ts', 'const pending = this.#childLaunches.then(', 'const pending = Promise.resolve().then('],
  'child-cas': ['ownership-store.ts', "if (!current || canonicalJson(current) !== canonicalJson(expected)) throw new Error('WORKER_OWNERSHIP_CAS_CONFLICT');", "if (!current) throw new Error('WORKER_OWNERSHIP_CAS_CONFLICT');"],
  'local-event-mount': ['native-hierarchy-events.ts', "option === 'memory_localevents' || option === 'pids_localevents'", "option === 'memory_localevents'"],
};
const change = cases[process.env.REVIEW_MUTATION];
if (!change) throw new Error('Unknown mutation');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/skills/worker/core/worker/' + change[0])) return result;
  const source = String(result.source);
  if (!source.includes(change[1])) throw new Error('Mutation target missing');
  return { ...result, source: source.replaceAll(change[1], change[2]) };
} });
