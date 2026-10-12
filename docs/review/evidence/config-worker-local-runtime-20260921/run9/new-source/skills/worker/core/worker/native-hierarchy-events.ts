import fs from 'node:fs';
import path from 'node:path';

/** Mountinfo vectors test parsing only; they are not cgroup enforcement evidence. */
export function validateHierarchicalCgroupEvents(mountinfo: string, scope: string): void {
  const mounts = mountinfo.trim().split('\n').map(line => {
    const [location, filesystem] = line.split(' - ');
    const fields = location?.split(' '); const tail = filesystem?.split(' ');
    if (!fields || fields.length < 6 || !tail || tail.length < 3) throw new Error('WORKER_NATIVE_MOUNTINFO_INVALID');
    const target = fields[4]!.replace(/\\([0-7]{3})/gu, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
    return { target, type: tail[0], options: tail[2]!.split(',') };
  }).filter(mount => scope === mount.target || scope.startsWith(mount.target.endsWith('/') ? mount.target : mount.target + '/'));
  const length = Math.max(...mounts.map(mount => mount.target.length));
  const covering = mounts.filter(mount => mount.target.length === length);
  if (covering.length !== 1 || covering[0]!.type !== 'cgroup2' || !path.isAbsolute(scope)) {
    throw new Error('WORKER_NATIVE_MOUNTINFO_INVALID');
  }
  if (covering[0]!.options.some(option => option === 'memory_localevents' || option === 'pids_localevents')) {
    throw new Error('WORKER_NATIVE_HIERARCHICAL_EVENTS_REQUIRED');
  }
}

export function requireHierarchicalCgroupEvents(scope: string): void {
  validateHierarchicalCgroupEvents(fs.readFileSync('/proc/self/mountinfo', 'utf8'), scope);
}
