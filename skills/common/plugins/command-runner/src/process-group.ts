import fs from 'node:fs';
import type { CommandProcessCleanupPolicy } from './types.ts';
import type { ChildProcess } from 'node:child_process';
import { captureLinuxProcessGroup, linuxProcessGroupRunning } from '@kubeclaw/plugin-foundation/processes/linux-process-group';

// The leader's exit and the group's lifetime are separate: descendants may
// still own stdout/stderr, even when child.exitCode is already set.
export class CommandProcessGroup {
  readonly #child: ChildProcess;
  readonly #policy: CommandProcessCleanupPolicy;
  readonly #graceMs: number;
  readonly #cgroup: string | undefined;
  #deadline: number | undefined;
  #force: NodeJS.Timeout | undefined;
  readonly #linuxGroup: number | undefined;
  readonly #identityError: unknown;

  constructor(child: ChildProcess, graceMs: number, cgroup: string | undefined, policy: CommandProcessCleanupPolicy) {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).sort().join(',') !== 'cleanupPollIntervalMs,exitAcknowledgementMs,sandboxMinimumGraceMs'
      || !Object.values(policy).every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647)) throw new Error('COMMAND_CLEANUP_POLICY_INVALID');
    this.#policy = Object.freeze({ ...policy });
    this.#child = child;
    this.#graceMs = graceMs;
    this.#cgroup = cgroup;
    if (process.platform === 'linux' && child.pid) {
      try { this.#linuxGroup = captureLinuxProcessGroup(child.pid); }
      catch (error) { this.#identityError = error; }
    }
  }

  terminate(): void {
    if (this.#deadline !== undefined) return;
    this.#deadline = Date.now() + this.#graceMs;
    this.#signal('SIGTERM');
    this.#force = setTimeout(() => this.#signal('SIGKILL'), this.#graceMs);
    this.#force.unref();
  }

  async cleanup(): Promise<void> {
    if (this.#alive()) {
      this.terminate();
      // Reuse the original deadline; close must not restart the grace budget.
      while (this.#alive() && Date.now() < this.#deadline!) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(this.#policy.cleanupPollIntervalMs, this.#deadline! - Date.now())));
      }
      if (this.#alive()) this.#signal('SIGKILL');
    }
    clearTimeout(this.#force);
    await this.#acknowledgeExit();
  }

  async #acknowledgeExit(): Promise<void> {
    if (process.platform !== 'linux' || !this.#alive()) return;
    if (this.#linuxGroup === undefined) throw new Error('COMMAND_PROCESS_GROUP_IDENTITY_UNAVAILABLE', { cause: this.#identityError });
    const deadline = (this.#deadline ?? Date.now()) + this.#policy.exitAcknowledgementMs;
    while (await linuxProcessGroupRunning(this.#linuxGroup, deadline)) {
      if (Date.now() >= deadline) throw new Error('COMMAND_PROCESS_GROUP_CLEANUP_TIMEOUT');
      this.#signal('SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, Math.min(this.#policy.cleanupPollIntervalMs, Math.max(1, deadline - Date.now()))));
    }
  }

  #signal(signal: NodeJS.Signals): void {
    if (signal === 'SIGKILL' && this.#cgroup) {
      try { fs.writeFileSync(`${this.#cgroup}/cgroup.kill`, '1'); }
      catch { /* INTENTIONAL_NONCRITICAL(cgroup_kill_failed): Still signal the process group; cgroup cleanup is retried after close. */ }
    }
    try {
      if (process.platform !== 'win32' && this.#child.pid) process.kill(-this.#child.pid, signal);
      else this.#child.kill(signal);
    } catch { /* INTENTIONAL_NONCRITICAL(group_already_stopped): The process group can stop before delivery. */ }
  }

  #alive(): boolean {
    if (process.platform === 'win32' || !this.#child.pid) return false;
    try { process.kill(-this.#child.pid, 0); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw new Error('COMMAND_PROCESS_GROUP_STATUS_FAILED', { cause: error });
    }
  }
}
