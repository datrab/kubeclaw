import { validateBusterProcessInputSettings, type BusterProcessInputSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';
import type { ChildProcess } from 'node:child_process';
import { captureLinuxProcessGroup, linuxProcessGroupRunning } from '@kubeclaw/plugin-foundation/processes/linux-process-group';

// Own both the native close and the group lifetime. A leader can exit while
// descendants remain runnable or keep its pipes open.
export class ProcessInputLifecycle {
  readonly #policy: BusterProcessInputSettings;
  readonly #child: ChildProcess;
  readonly #closed: Promise<void>;
  readonly #group: number | undefined;
  readonly #identityError: unknown;
  #cleanup: Promise<void> | undefined;

  constructor(child: ChildProcess, closed: Promise<void>, policy: BusterProcessInputSettings) {
    this.#policy = validateBusterProcessInputSettings(policy);
    this.#child = child; this.#closed = closed;
    if (process.platform === 'linux' && child.pid) {
      try { this.#group = captureLinuxProcessGroup(child.pid); }
      catch (error) { this.#identityError = error; }
    }
  }

  cleanup(): Promise<void> {
    this.#cleanup ??= this.#finish();
    return this.#cleanup;
  }

  async #finish(): Promise<void> {
    const deadline = Date.now() + this.#policy.cleanupTimeoutMs;
    const failures: unknown[] = [];
    let force: NodeJS.Timeout | undefined;
    let bound: NodeJS.Timeout | undefined;
    try {
      // Signal failure does not release ownership: still await close and group quiescence.
      this.#attemptSignal('SIGTERM', failures);
      force = setTimeout(() => this.#attemptSignal('SIGKILL', failures), 250);
      await Promise.race([
        this.#acknowledgeClosure(deadline, failures),
        new Promise<never>((_resolve, reject) => {
          bound = setTimeout(() => reject(new Error('PROCESS_INPUT_CLEANUP_TIMEOUT')), Math.max(1, deadline - Date.now()));
        }),
      ]);
    } catch (error) {
      this.#attemptSignal('SIGKILL', failures);
      // Destroying host pipe ends is not a termination claim. Preserve all causes.
      this.#child.stdin?.destroy(); this.#child.stdout?.destroy(); this.#child.stderr?.destroy();
      if (failures.length) throw new AggregateError([error, ...failures], 'PROCESS_INPUT_CLEANUP_FAILED', { cause: error });
      throw error;
    } finally { clearTimeout(force); clearTimeout(bound); }
    if (failures.length) throw new AggregateError(failures, 'PROCESS_INPUT_CLEANUP_FAILED');
  }

  #attemptSignal(signal: NodeJS.Signals, failures: unknown[]): void {
    try { this.#signal(signal); }
    catch (error) { failures.push(error); }
  }

  async #acknowledgeClosure(deadline: number, failures: unknown[]): Promise<void> {
    // Record group failure immediately, but still wait for actual close within the same deadline.
    await Promise.all([this.#closed, this.#acknowledge(deadline).catch(error => { failures.push(error); })]);
  }

  async #acknowledge(deadline: number): Promise<void> {
    if (process.platform !== 'linux') return;
    if (!this.#alive()) return;
    if (this.#group === undefined) throw new Error('PROCESS_INPUT_IDENTITY_UNAVAILABLE', { cause: this.#identityError });
    while (await linuxProcessGroupRunning(this.#group, deadline)) {
      if (Date.now() >= deadline) throw new Error('PROCESS_INPUT_CLEANUP_TIMEOUT');
      await new Promise((resolve) => setTimeout(resolve, this.#policy.acknowledgementPollMs));
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
