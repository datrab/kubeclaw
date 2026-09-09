import fs from 'node:fs';
import type { CommandRunnerOptions } from './types.ts';

export function cgroupRoot(value: string): string {
  const root = fs.realpathSync(value);
  const controllers = fs.readFileSync(`${root}/cgroup.controllers`, 'utf8').trim().split(/\s+/u);
  if (!['pids', 'memory', 'cpu'].every((controller) => controllers.includes(controller))) {
    throw new Error('COMMAND_CGROUP_CONTROLLERS_UNAVAILABLE');
  }
  const subtreeControl = `${root}/cgroup.subtree_control`;
  try { fs.writeFileSync(subtreeControl, '+pids +memory +cpu'); }
  catch { throw new Error('COMMAND_CGROUP_CONTROLLERS_NOT_DELEGATED'); }
  const enabled = fs.readFileSync(subtreeControl, 'utf8').trim().split(/\s+/u);
  if (!['pids', 'memory', 'cpu'].every((controller) => enabled.includes(controller))) {
    throw new Error('COMMAND_CGROUP_CONTROLLERS_NOT_ENABLED');
  }
  return root;
}

export function createCgroup(options: CommandRunnerOptions, maximumProcesses: number, memoryBytes: number, cpuMillis: number,
  maximumExecutionMs: number): string | undefined {
  if (!options.cgroupRoot) return undefined;
  const root = cgroupRoot(options.cgroupRoot);
  const group = fs.mkdtempSync(`${root}/kubeclaw-command-`);
  try {
    fs.writeFileSync(`${group}/pids.max`, String(maximumProcesses + 1));
    fs.writeFileSync(`${group}/memory.max`, String(memoryBytes));
    if (fs.existsSync(`${group}/memory.swap.max`)) fs.writeFileSync(`${group}/memory.swap.max`, '0');
    const cpuPeriodMicroseconds = 100_000;
    const cpuQuotaMicroseconds = Math.max(1_000, Math.min(cpuPeriodMicroseconds,
      Math.floor((cpuMillis / maximumExecutionMs) * cpuPeriodMicroseconds)));
    fs.writeFileSync(`${group}/cpu.max`, `${cpuQuotaMicroseconds} ${cpuPeriodMicroseconds}`);
    return group;
  } catch (error) {
    try { fs.rmdirSync(group); } catch { /* INTENTIONAL_NONCRITICAL(cgroup_setup_cleanup_failed): Preserve the original setup error. */ }
    throw error;
  }
}

export function cleanupCgroup(group: string | undefined): void {
  if (!group) return;
  try { fs.writeFileSync(`${group}/cgroup.kill`, '1'); } catch { /* INTENTIONAL_NONCRITICAL(cgroup_already_empty): Preserve existing best-effort cgroup cleanup after process termination. */ }
  try { fs.rmdirSync(group); } catch { /* INTENTIONAL_NONCRITICAL(cgroup_removal_pending): The kernel can finish removal after the final process exits. */ }
}
