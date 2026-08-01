import { execFile } from 'child_process';
import { buildSubprocessEnv } from '../security.js';

export type K8sCommandEnv = Record<string, string | undefined>;

export function buildK8sCommandEnv(kubeconfigPath: string | null): K8sCommandEnv {
  return buildSubprocessEnv(kubeconfigPath ? { KUBECONFIG: kubeconfigPath } : {});
}

export function execFileWithInput(command: string, args: string[], input: string, options: Record<string, any> = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'utf8',
      timeout: options.timeout,
      maxBuffer: Number.isFinite(options.maxBuffer) ? Number(options.maxBuffer) : 5 * 1024 * 1024,
      env: options.env ?? buildSubprocessEnv(),
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    if (child.stdin === null) {
      reject(new Error(`${command} did not expose stdin`));
      return;
    }
    child.stdin.end(input);
  });
}
