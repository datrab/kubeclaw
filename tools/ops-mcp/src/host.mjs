import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
let active = false;

export async function hostDiagnostics() {
  if (process.env.OPS_EXTERNAL !== '1') throw new Error('External host diagnostics is not configured');
  if (active) throw new Error('A host diagnostic is already running; retry after it finishes');
  active = true;
  try {
    const { stdout } = await execute('/usr/bin/ssh', [
      '-F', '/etc/kubeclaw-ops/ssh_config', '-T', 'kubeclaw-diagnostics',
    ], {
      timeout: 15_000, maxBuffer: 256 * 1024, killSignal: 'SIGKILL',
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    });
    return JSON.parse(stdout);
  } catch {
    throw new Error('Host diagnostics unavailable: check host reachability, pinned SSH host key and forced-command setup');
  } finally { active = false; }
}
