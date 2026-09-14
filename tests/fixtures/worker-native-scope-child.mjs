import fs from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';

// Controlled native test workload, not the production pre-execution launcher.
fs.writeFileSync(`${process.argv[2]}/cgroup.procs`, String(process.pid));
process.on('SIGTERM', () => {});
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => {
  if (data.trim() !== 'work') return;
  pbkdf2Sync('owned-work', 'actual-cpu-load', 500000, 32, 'sha256');
  process.stdout.write('worked\n');
});
process.stdout.write('ready\n');
setInterval(() => {}, 1000);
