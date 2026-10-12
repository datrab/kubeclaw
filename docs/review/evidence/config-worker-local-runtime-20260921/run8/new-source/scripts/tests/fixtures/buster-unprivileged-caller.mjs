import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Observe the ordinary caller after its UID/GID transition and before helper exec.
const status = fs.readFileSync('/proc/self/status', 'utf8');
const child = spawnSync(process.argv[2], ['--page-size'], { encoding: 'utf8', timeout: 15000, maxBuffer: 131072 });
process.stdout.write(JSON.stringify({ status, child: {
  status: child.status, signal: child.signal, error: child.error?.code ?? null,
  stdout: child.stdout, stderr: child.stderr,
} }));
