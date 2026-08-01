import { execFile } from 'child_process';
import { buildSubprocessEnv } from '../security.js';
export function buildK8sCommandEnv(kubeconfigPath) {
    return buildSubprocessEnv(kubeconfigPath ? { KUBECONFIG: kubeconfigPath } : {});
}
export function execFileWithInput(command, args, input, options = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(command, args, {
            encoding: 'utf8',
            timeout: options.timeout,
            maxBuffer: Number.isFinite(options.maxBuffer) ? Number(options.maxBuffer) : 5 * 1024 * 1024,
            env: options.env ?? buildSubprocessEnv(),
        }, (error, stdout, stderr) => {
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
