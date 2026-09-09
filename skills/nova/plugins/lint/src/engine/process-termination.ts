import type { ChildProcess } from 'node:child_process';
import { captureLinuxProcessGroup, waitForLinuxGroupExit } from './linux-process-group.ts';

/** A termination request completes only after kernel exit acknowledgement. */
export class ProcessTermination {
  readonly #child: ChildProcess;
  readonly failure: Promise<never>;
  #reject!: (error: Error) => void;
  #outerGroup: number | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  cleanup: Promise<void> | undefined;
  reason: string | undefined;
  error: Error | undefined;

  constructor(child: ChildProcess) {
    this.#child = child;
    this.failure = new Promise<never>((_resolve, reject) => { this.#reject = reject; });
  }

  capture(): void {
    if (process.platform !== 'linux' || !this.#child.pid) return;
    try { this.#outerGroup = captureLinuxProcessGroup(this.#child.pid); }
    catch (error) { this.error = error as Error; this.stop('process group inspection failed'); }
  }

  #kill(signal: NodeJS.Signals): void {
    try {
      if (this.#child.pid && process.platform !== 'win32') process.kill(-this.#child.pid, signal);
      else this.#child.kill(signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') this.error = error as Error;
    }
  }

  stop(reason: string): void {
    if (this.reason) return;
    this.reason = reason;
    const deadline = Date.now() + 1500;
    this.#timer = setTimeout(() => this.#reject(Object.assign(new Error('LINT_PROCESS_CLEANUP_FAILED'), { code: 'LINT_PROCESS_CLEANUP_FAILED' })), 1500);
    this.#kill('SIGTERM');
    // Keep escalation after leader close: descendants may close inherited FDs.
    this.cleanup = new Promise<void>((resolve) => setTimeout(resolve, 250)).then(async () => {
      this.#kill('SIGKILL');
      if (process.platform === 'linux' && this.#child.pid) {
        if (this.#outerGroup === undefined) {
          // A very short-lived leader/group can exit before initial capture.
          this.#outerGroup = captureLinuxProcessGroup(this.#child.pid);
        }
        if (this.#outerGroup !== undefined) await waitForLinuxGroupExit(this.#outerGroup, deadline);
      }
    });
    // Observe failure immediately even if the leader still owns inherited FDs.
    this.cleanup.catch((error: Error) => this.#reject(error));
  }

  async finish(closed: Promise<number | null>): Promise<number | null> {
    try {
      const status = await Promise.race([closed, this.failure]);
      await Promise.race([this.cleanup, this.failure]);
      return status;
    } finally { clearTimeout(this.#timer); }
  }
}
