import fs from 'node:fs';

function numbers(status: string, field: string): number[] {
  const text = status.match(new RegExp(`^${field}:\\s+(.+)$`, 'm'))?.[1];
  if (!text) throw new Error(`PROCESS_PROC_FIELD_UNAVAILABLE:${field}`);
  const values = text.trim().split(/\s+/u).map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error(`PROCESS_PROC_FIELD_INVALID:${field}`);
  return values;
}
function vanished(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ESRCH';
}

export function captureLinuxProcessGroup(pid: number): number {
  const depth = numbers(fs.readFileSync('/proc/self/status', 'utf8'), 'NSpid').length - 1;
  const namespace = fs.readlinkSync('/proc/self/ns/pid');
  const deadline = Date.now() + 250;
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/u.test(entry)) continue;
    if (Date.now() >= deadline) throw new Error('PROCESS_PROCESS_GROUP_IDENTITY_TIMEOUT');
    try {
      const status = fs.readFileSync(`/proc/${entry}/status`, 'utf8');
      const groups = numbers(status, 'NSpgid');
      if (groups[depth] === pid && fs.readlinkSync(`/proc/${entry}/ns/pid`) === namespace) return groups[0]!;
    } catch (error) { if (!vanished(error)) throw error; }
  }
  throw new Error('PROCESS_PROCESS_GROUP_IDENTITY_UNAVAILABLE');
}

export async function linuxProcessGroupRunning(group: number, deadline: number): Promise<boolean> {
  for (const entry of await fs.promises.readdir('/proc')) {
    if (!/^\d+$/u.test(entry)) continue;
    if (Date.now() >= deadline) throw new Error('PROCESS_PROCESS_GROUP_CLEANUP_TIMEOUT');
    try {
      const status = await fs.promises.readFile(`/proc/${entry}/status`, 'utf8');
      if (numbers(status, 'NSpgid')[0] !== group) continue;
      const state = status.match(/^State:\s+(\S)/mu)?.[1];
      if (!state) throw new Error('PROCESS_PROC_STATE_UNAVAILABLE');
      if (state !== 'Z' && state !== 'X') return true;
    } catch (error) { if (!vanished(error)) throw error; }
  }
  return false;
}
