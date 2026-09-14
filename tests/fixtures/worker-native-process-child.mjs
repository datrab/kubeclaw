import { pbkdf2Sync } from 'node:crypto';
import fs from 'node:fs';

let input = '';
for await (const chunk of process.stdin) input += chunk.toString('utf8');
const request = JSON.parse(input);
pbkdf2Sync('owned-attempt', 'real-cpu', request.iterations, 32, 'sha256');
// These facts come from the launched process, not an injected process implementation.
process.stdout.write(JSON.stringify({ uid: process.getuid(), gid: process.getgid(), groups: process.getgroups(),
  membership: fs.readFileSync('/proc/self/cgroup', 'utf8'), completed: true }));
