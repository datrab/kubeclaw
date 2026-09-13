import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';

/** Own the launcher interval before kernel scope membership, as well as the host. */
export class NativeProcessLaunches {
  readonly #children = new Map<ChildProcessWithoutNullStreams, Promise<void>>();
  #closed = false;
  #drain: Promise<void> | undefined;

  spawn(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio,
    controlPipe = false): ChildProcessWithoutNullStreams {
    if (this.#closed) throw new Error('WORKER_NATIVE_LAUNCH_FENCED');
    const child = spawn(executable, [...args], { ...options,
      stdio: controlPipe ? ['pipe', 'pipe', 'pipe', 'pipe'] : 'pipe' }) as ChildProcessWithoutNullStreams;
    const exited = new Promise<void>(resolve => {
      const done = () => { this.#children.delete(child); resolve(); };
      child.once('exit', done);
      // A failed spawn has no process to reap. Later signal/IPC errors do not
      // prove termination: an existing child is retained until its exit event.
      child.on('error', () => { if (child.pid === undefined) done(); });
    });
    this.#children.set(child, exited);
    return child;
  }

  drain(timeoutMs: number): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      return Promise.reject(new Error('WORKER_NATIVE_DRAIN_LIMIT_INVALID'));
    }
    this.#closed = true;
    this.#drain ??= this.#stop(timeoutMs);
    return this.#drain;
  }

  async #stop(timeoutMs: number): Promise<void> {
    const children = [...this.#children];
    for (const [child] of children) child.kill('SIGKILL');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([Promise.all(children.map(([, exited]) => exited)), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('WORKER_NATIVE_LAUNCHER_DRAIN_TIMEOUT')), timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
