import fs from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

function ids(status: string, field: string): number[] {
  const value = new RegExp(`^${field}:\\s+(.+)$`, 'm').exec(status)?.[1];
  if (!value) throw new Error(`LINT_PROCESS_GROUP_STATUS_INVALID:${field}`);
  return value.trim().split(/\s+/u).map(Number);
}

function vanished(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ESRCH';
}

/** Capture host PGID before yielding/reaping the leader. /proc may be mounted
 * outside our PID namespace; namespace-local PIDs are unsafe /proc keys. */
export function captureLinuxProcessGroup(pid: number): number | undefined {
  const own = fs.readFileSync('/proc/self/status', 'utf8');
  const namespace = fs.readlinkSync('/proc/self/ns/pid');
  const depth = ids(own, 'NSpid').length - 1;
  const children = fs.readdirSync('/proc').filter((entry) => /^\d+$/u.test(entry));
  for (const child of children) {
    let status: string;
    try { status = fs.readFileSync(`/proc/${child}/status`, 'utf8'); }
    catch (error) { if (vanished(error)) continue; throw error; }
    if (ids(status, 'NSpgid')[depth] !== pid) continue;
    try { if (fs.readlinkSync(`/proc/${child}/ns/pid`) === namespace) return ids(status, 'NSpgid')[0]!; }
    catch (error) { if (vanished(error)) continue; throw error; }
  }
  try { process.kill(-pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return undefined; throw error; }
  throw new Error(`LINT_PROCESS_GROUP_UNVERIFIABLE:${pid}`);
}

async function liveMember(entry: string, group: number): Promise<boolean> {
  let status: string;
  try { status = await readFile(`/proc/${entry}/status`, 'utf8'); }
  catch (error) { if (vanished(error)) return false; throw error; }
  if (ids(status, 'NSpgid')[0] !== group) return false;
  const state = /^State:\s+([A-Z])/mu.exec(status)?.[1];
  if (!state) throw new Error('LINT_PROCESS_GROUP_STATE_INVALID');
  return state !== 'Z' && state !== 'X';
}

async function groupIsRunning(group: number): Promise<boolean> {
  const entries = (await readdir('/proc')).filter((entry) => /^\d+$/u.test(entry));
  // Bound concurrent file descriptors even on a busy host proc mount.
  for (let offset = 0; offset < entries.length; offset += 64) {
    if ((await Promise.all(entries.slice(offset, offset + 64).map((entry) => liveMember(entry, group)))).some(Boolean)) return true;
  }
  return false;
}

export async function waitForLinuxGroupExit(group: number, deadline: number): Promise<void> {
  while (await groupIsRunning(group)) {
    if (Date.now() >= deadline) throw new Error('LINT_PROCESS_GROUP_EXIT_TIMEOUT');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
