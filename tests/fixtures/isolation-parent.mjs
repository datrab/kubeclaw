import { spawn } from 'node:child_process';
import fs from 'node:fs';
// Real host-process death probe: the native supervisor must outlive and clean
// its workload when this parent is killed without running JavaScript finally.
const [launcher, group, script, marker, supervisorMarker, uid, gid] = process.argv.slice(2);
const identity = uid ? ['--run-as-uid', uid, '--run-as-gid', gid, '--cgroup'] : ['--child-cgroup'];
const child = spawn(launcher, ['134217728', '5', '64', ...identity, group, script, marker], { stdio: ['pipe', 'pipe', 'pipe'] });
child.on('error', (error) => { throw error; });
fs.writeFileSync(supervisorMarker, String(child.pid));
setInterval(() => {}, 1000);
