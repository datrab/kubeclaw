// Task-scoped Kubernetes service access. The leased workload stays inside its
// namespace; dependent suites receive a loopback port that is closed by the
// suite runner's guaranteed runtime cleanup path.
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { spawn } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import net from 'net';
import type { K8sCommandEnv } from './k8s-command-env.ts';

type SuiteLog = (message: string) => void;

function trimOutput(value: unknown, max = 500): string {
  const text = value == null ? '' : String(value).trim();
  return text.length <= max ? text : `${text.slice(0, max)}…[${text.length - max} chars]`;
}

function allocateLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error: unknown) => {
        if (error) return reject(error);
        if (!address || typeof address === 'string') return reject(new Error('could not allocate local port for kubectl port-forward'));
        resolve(address.port);
      });
    });
  });
}

export function buildLocalServiceHealthUrl(localPort: number, healthPath: string): string {
  return `http://127.0.0.1:${localPort}${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;
}

export async function startServicePortForward(ns: string, serviceName: string, servicePort: number, healthPath: string, log: SuiteLog, env: K8sCommandEnv): Promise<{ localPort: number; url: string; stop: () => Promise<void> }> {
  const localPort = await allocateLocalPort();
  const url = buildLocalServiceHealthUrl(localPort, healthPath);
  log(`Port-forwarding svc/${serviceName} ${localPort}:${servicePort} in ${ns}`);
  const child = spawn('kubectl', ['-n', ns, 'port-forward', `svc/${serviceName}`, `${localPort}:${servicePort}`, '--address', '127.0.0.1'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let settled = false;
  let exited = false;
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`kubectl port-forward did not become ready: ${trimOutput(output)}`)), 15000);
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: unknown): void => {
      output += String(chunk);
      if (/Forwarding from/i.test(output)) finish();
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', (error: Error) => finish(error));
    child.once('exit', (code: number | null, signal: string | null) => {
      exited = true;
      finish(new Error(`kubectl port-forward exited before ready (code=${code ?? 'unknown'} signal=${signal ?? 'unknown'}): ${trimOutput(output)}`));
    });
  });
  try {
    await ready;
  } catch (error) {
    if (!exited) child.kill('SIGTERM');
    throw error;
  }

  return {
    localPort,
    url,
    stop: async (): Promise<void> => {
      if (exited) return;
      await new Promise<void>((resolve) => {
        let complete = false;
        const finish = (): void => {
          if (complete) return;
          complete = true;
          clearTimeout(forceTimer);
          resolve();
        };
        const forceTimer = setTimeout(() => {
          if (!exited) child.kill('SIGKILL');
          finish();
        }, 5000);
        child.once('exit', () => {
          exited = true;
          finish();
        });
        child.kill('SIGTERM');
      });
    },
  };
}

export async function withServicePortForward<T>(ns: string, serviceName: string, servicePort: number, healthPath: string, log: SuiteLog, env: K8sCommandEnv, action: (url: string) => Promise<T>): Promise<T> {
  const portForward = await startServicePortForward(ns, serviceName, servicePort, healthPath, log, env);
  try {
    return await action(portForward.url);
  } finally {
    await portForward.stop();
  }
}
