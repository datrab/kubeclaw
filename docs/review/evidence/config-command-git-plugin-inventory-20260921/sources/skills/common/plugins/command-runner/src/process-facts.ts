import fs from 'node:fs';
import type { ProcessFacts } from './types.ts';

function cgroupFacts(group: string): ProcessFacts | null {
  try {
    const cpu = fs.readFileSync(`${group}/cpu.stat`, 'utf8');
    const usageMicroseconds = Number(cpu.match(/^usage_usec\s+(\d+)$/mu)?.[1] ?? NaN);
    const memoryBytes = Number(fs.readFileSync(`${group}/memory.current`, 'utf8').trim());
    const processes = Number(fs.readFileSync(`${group}/pids.current`, 'utf8').trim());
    if (![usageMicroseconds, memoryBytes, processes].every(Number.isFinite)) return null;
    return { cpuTimeMs: usageMicroseconds / 1000, memoryBytes, processes };
  } catch {
    // INTENTIONAL_NONCRITICAL(cgroup_sample_unavailable): Preserve the existing sampled-accounting fallback.
    return null;
  }
}

function processParents(): Map<number, number> {
  const parents = new Map<number, number>();
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/u.test(name)) continue;
    try {
      const status = fs.readFileSync(`/proc/${name}/status`, 'utf8');
      parents.set(Number(name), Number(status.match(/^PPid:\s+(\d+)$/mu)?.[1] ?? -1));
    } catch { /* INTENTIONAL_NONCRITICAL(process_exited_during_sample): /proc entries can disappear while sampling. */ }
  }
  return parents;
}

function descendantIds(pid: number, parents: ReadonlyMap<number, number>): Set<number> {
  const descendants = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, parent] of parents) {
      if (!descendants.has(parent) || descendants.has(candidate)) continue;
      descendants.add(candidate);
      changed = true;
    }
  }
  return descendants;
}

function sampledFacts(descendants: ReadonlySet<number>): ProcessFacts {
  let cpuTimeMs = 0;
  let memoryBytes = 0;
  for (const processId of descendants) {
    try {
      const stat = fs.readFileSync(`/proc/${processId}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u);
      cpuTimeMs += ((Number(fields[11]) + Number(fields[12])) / 100) * 1000;
      const status = fs.readFileSync(`/proc/${processId}/status`, 'utf8');
      memoryBytes += Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/mu)?.[1] ?? 0) * 1024;
    } catch { /* INTENTIONAL_NONCRITICAL(process_exited_during_sample): /proc entries can disappear while sampling. */ }
  }
  return { cpuTimeMs, memoryBytes, processes: descendants.size };
}

export function processFacts(pid: number, cgroup?: string): ProcessFacts | null {
  try {
    const sampled = sampledFacts(descendantIds(pid, processParents()));
    const group = cgroup ? cgroupFacts(cgroup) : null;
    return { cpuTimeMs: group?.cpuTimeMs ?? sampled.cpuTimeMs,
      memoryBytes: group?.memoryBytes ?? sampled.memoryBytes, processes: sampled.processes };
  } catch {
    // INTENTIONAL_NONCRITICAL(process_sample_unavailable): null explicitly reports an unavailable sample to execution.
    return null;
  }
}
