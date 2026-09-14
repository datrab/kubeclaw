import fs from 'node:fs';
import path from 'node:path';

// The host cgroup2 mount root has no resource counters. Observe this test's
// actual systemd scope (or the namespace root when running in a container).
export function currentTestCgroup() {
  const membership = /^0::(.+)$/m.exec(fs.readFileSync('/proc/self/cgroup', 'utf8'))?.[1];
  if (!membership || !membership.startsWith('/') || membership.split('/').includes('..')) {
    throw new Error('TEST_CGROUP_MEMBERSHIP_INVALID');
  }
  const scope = path.join('/sys/fs/cgroup', membership);
  for (const counter of ['cgroup.events', 'cpu.stat', 'memory.peak', 'memory.events', 'pids.peak', 'pids.events']) {
    fs.accessSync(path.join(scope, counter), fs.constants.R_OK);
  }
  return scope;
}
