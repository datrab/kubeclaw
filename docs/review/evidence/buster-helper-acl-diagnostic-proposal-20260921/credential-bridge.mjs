import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const status = fs.readFileSync('/proc/self/status', 'utf8');
const result = spawnSync('/opt/ha-proof/restricted', ['--page-size'], { encoding: 'utf8', timeout: 10000, maxBuffer: 131072 });
console.log(JSON.stringify({ status, child: { status: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: result.stdout, stderr: result.stderr } }));
