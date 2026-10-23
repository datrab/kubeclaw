import { captureSourceAcquisitionPolicy, LEGACY_SOURCE_ACQUISITION_POLICY, type SourceAcquisitionPolicy } from './source-acquisition-policy.ts';
import type { ChildProcess } from 'node:child_process';
import { captureLinuxProcessGroup, linuxProcessGroupRunning } from '@kubeclaw/plugin-foundation/processes/linux-process-group';

/** Own Git's process group and local pipes; escaped descendants are not termination proof. */
export class SourceProcessLifecycle {
  readonly #policy: SourceAcquisitionPolicy;
  readonly #child: ChildProcess;
  readonly #closed: Promise<void>;
  readonly #group: number | undefined;
  readonly #identityError: unknown;
  #cleanup: Promise<void> | undefined;

  constructor(child: ChildProcess, closed: Promise<void>, policy: SourceAcquisitionPolicy = LEGACY_SOURCE_ACQUISITION_POLICY) {
    this.#policy = captureSourceAcquisitionPolicy(policy);
    this.#child = child; this.#closed = closed;
    if (process.platform === 'linux' && child.pid) {
      try { this.#group = captureLinuxProcessGroup(child.pid); }
      catch (error) { this.#identityError = error; }
    }
  }

  cleanup(): Promise<void> { this.#cleanup ??= this.#finish(); return this.#cleanup; }

  async #finish(): Promise<void> {
    const deadline = Date.now() + this.#policy.cleanupTimeoutMs;
    let force: NodeJS.Timeout | undefined;
    let bound: NodeJS.Timeout | undefined;
    const signalFailures: unknown[] = [];
    try {
      try { this.#signal('SIGTERM'); } catch (error) { signalFailures.push(error); }
      force = setTimeout(() => {
        try { this.#signal('SIGKILL'); } catch (error) { signalFailures.push(error); }
      }, this.#policy.forceKillAfterMs);
      await Promise.race([
        Promise.all([this.#closed, this.#acknowledge(deadline).catch(error => { signalFailures.push(error); })]),
        new Promise<never>((_resolve, reject) => {
          bound = setTimeout(() => reject(new Error('NOVA_SOURCE_PROCESS_CLEANUP_TIMEOUT')), Math.max(1, deadline - Date.now()));
        }),
      ]);
    } catch (error) {
      try { this.#signal('SIGKILL'); } catch (signalError) { signalFailures.push(signalError); }
      this.#child.stdout?.destroy(); this.#child.stderr?.destroy();
      throw signalFailures.length ? new AggregateError([error, ...signalFailures], 'NOVA_SOURCE_PROCESS_CLEANUP_FAILED', { cause: error }) : error;
    } finally { clearTimeout(force); clearTimeout(bound); }
    if (signalFailures.length) throw new AggregateError(signalFailures, 'NOVA_SOURCE_PROCESS_CLEANUP_FAILED');
  }

  async #acknowledge(deadline: number): Promise<void> {
    if (process.platform !== 'linux' || !this.#alive()) return;
    if (this.#group === undefined) throw new Error('NOVA_SOURCE_PROCESS_IDENTITY_UNAVAILABLE', { cause: this.#identityError });
    while (await linuxProcessGroupRunning(this.#group, deadline)) {
      if (Date.now() >= deadline) throw new Error('NOVA_SOURCE_PROCESS_CLEANUP_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, this.#policy.pollIntervalMs));
    }
  }

  #alive(): boolean {
    if (!this.#child.pid || process.platform === 'win32') return false;
    try { process.kill(-this.#child.pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  }

  #signal(signal: NodeJS.Signals): void {
    try {
      if (process.platform !== 'win32' && this.#child.pid) process.kill(-this.#child.pid, signal);
      else this.#child.kill(signal);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
