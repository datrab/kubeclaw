import fs from 'node:fs';
import process from 'node:process';
import type { ChildProcess } from 'node:child_process';

/** A disappearing /proc entry is expected; permission/I/O failures are not a sample. */
function processFile(pid: number, name: 'stat' | 'status'): string | null {
  try { return fs.readFileSync(`/proc/${pid}/${name}`, 'utf8'); }
  catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ESRCH') return null;
    throw new Error('TEST_PROVIDER_PROCESS_OBSERVATION_FAILED', { cause });
  }
}

function processParents(): Map<number, number> {
  const parents = new Map<number, number>();
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/u.test(name)) continue;
    const status = processFile(Number(name), 'status');
    if (status === null) continue;
    parents.set(Number(name), Number(/^PPid:\s+(\d+)$/mu.exec(status)?.[1] ?? -1));
  }
  return parents;
}

function descendantsOf(pid: number, parents: ReadonlyMap<number, number>): Set<number> {
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

export function processFacts(pid: number): { cpuTimeMs: number; memoryBytes: number; processes: number } {
  const descendants = descendantsOf(pid, processParents());
  let cpuTimeMs = 0; let memoryBytes = 0;
  for (const processId of descendants) {
    const stat = processFile(processId, 'stat');
    if (stat === null) continue;
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/u);
    cpuTimeMs += ((Number(fields[11]) + Number(fields[12])) / 100) * 1000;
    const status = processFile(processId, 'status');
    if (status !== null) memoryBytes += Number(/^VmRSS:\s+(\d+)\s+kB$/mu.exec(status)?.[1] ?? 0) * 1024;
  }
  return { cpuTimeMs, memoryBytes, processes: descendants.size };
}

export function signalProvider(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw new Error('TEST_PROVIDER_PROCESS_SIGNAL_FAILED', { cause });
  }
}
