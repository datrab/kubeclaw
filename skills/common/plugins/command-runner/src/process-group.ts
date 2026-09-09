import fs from 'node:fs';
import type { ChildProcess } from 'node:child_process';

// The leader's exit and the group's lifetime are separate: descendants may
// still own stdout/stderr, even when child.exitCode is already set.
export class CommandProcessGroup {
  readonly #child: ChildProcess;
  readonly #graceMs: number;
  readonly #cgroup: string | undefined;
  #deadline: number | undefined;
  #force: NodeJS.Timeout | undefined;

  constructor(child: ChildProcess, graceMs: number, cgroup?: string) {
    this.#child = child;
    this.#graceMs = graceMs;
    this.#cgroup = cgroup;
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
        await new Promise((resolve) => setTimeout(resolve, Math.min(10, this.#deadline! - Date.now())));
      }
      if (this.#alive()) this.#signal('SIGKILL');
    }
    clearTimeout(this.#force);
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
    catch { return false; }
  }
}
