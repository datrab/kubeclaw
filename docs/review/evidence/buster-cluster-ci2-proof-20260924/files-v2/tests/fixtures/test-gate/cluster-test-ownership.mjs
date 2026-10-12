/** Test lifetime only. Every observed spawn delegates unchanged to the real
 * implementation; only the actual close event confirms child disposal. */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

export async function ownedClusterTest(t, root, action) {
  const controller = new AbortController();
  const children = [];
  const runtimes = [];
  const realSpawn = childProcess.spawn;
  const observer = t.mock.method(childProcess, 'spawn', function (...args) {
    const child = Reflect.apply(realSpawn, childProcess, args);
    const closed = new Promise(resolve => child.once('close', resolve));
    children.push({ child, closed });
    return child;
  });
  syncBuiltinESMExports();
  const abort = () => controller.abort(t.signal.reason ?? new Error('CLUSTER_TEST_FINISHED'));
  t.signal.addEventListener('abort', abort, { once: true });
  if (t.signal.aborted) abort();
  const owner = {
    signal: controller.signal,
    invoke(action) { controller.signal.throwIfAborted(); return action(controller.signal); },
    runtime(runtime) {
      controller.signal.throwIfAborted();
      const record = { runtime, starting: undefined, stopping: undefined };
      runtimes.push(record);
      return {
        start() {
          controller.signal.throwIfAborted();
          record.starting = Promise.resolve().then(() => runtime.start());
          return record.starting;
        },
        stop() { return stop(record); },
      };
    },
  };
  function stop(record) {
    record.stopping ??= Promise.resolve(record.starting).catch(() => {}).then(() => record.runtime.stop());
    return record.stopping;
  }
  const body = Promise.resolve().then(() => action(owner));
  // Observe the body immediately. Its original rejection still goes to node:test.
  const bodySettled = body.then(() => undefined, () => undefined);
  t.after(async () => {
    abort();
    let timer;
    try {
      await Promise.race([
        (async () => {
          // Signal cancellation reaches invokes/gate first. Shutdown is started
          // concurrently so it also aborts jobs whose client already stopped.
          const stopped = Promise.allSettled(runtimes.map(stop));
          await bodySettled;
          const outcomes = await stopped;
          const failures = outcomes.filter(item => item.status === 'rejected');
          if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'CLUSTER_TEST_SHUTDOWN_FAILED');
          // The joined body cannot register new runtimes after this point.
          await Promise.all(runtimes.map(stop));
          await Promise.all(children.map(({ closed }) => closed));
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`CLUSTER_TEST_DISPOSAL_UNCONFIRMED:${root}`)), 10000);
        }),
      ]);
      fs.rmSync(root, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`CLUSTER_TEST_FILES_RETAINED:${root}`, { cause: error });
    } finally {
      clearTimeout(timer);
      t.signal.removeEventListener('abort', abort);
      observer.mock.restore(); syncBuiltinESMExports();
    }
  });
  return body;
}
