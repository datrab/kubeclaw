import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

// Kubernetes remotecommand v4: no stdin/TTY, separate stdout/stderr/status.
// This transport cannot choose API verbs or paths outside pods/exec.
export function createPodExec({ api = process.env.KUBERNETES_API_URL ?? 'https://kubernetes.default.svc',
  tokenFile = process.env.KUBERNETES_TOKEN_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
  caFile = process.env.KUBERNETES_CA_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt' } = {}) {
  const origin = new URL(api);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('KUBERNETES_API_URL must be an HTTPS origin without credentials or a path');
  }
  return async function execPod({ namespace, pod, container, command, timeoutSeconds, maxOutputBytes }, signal) {
    const url = new URL(`/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/exec`, origin);
    url.protocol = 'wss:';
    for (const [k, v] of Object.entries({ container, stdin: 'false', stdout: 'true', stderr: 'true', tty: 'false' })) url.searchParams.set(k, v);
    for (const arg of command) url.searchParams.append('command', arg);
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token || /\s/.test(token)) throw new Error('Invalid Kubernetes token file');
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, 'v4.channel.k8s.io', { ca: readFileSync(caFile), rejectUnauthorized: true,
        headers: { Authorization: `Bearer ${token}` }, followRedirects: false,
        handshakeTimeout: Math.min(timeoutSeconds * 1000, 10000), maxPayload: 1024 * 1024 });
      const stdout = [], stderr = [];
      let status, statusBytes = 0, outputBytes = 0, settled = false;
      const done = (error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
        socket.terminate();
        if (error) reject(error); else resolve(result);
      };
      const abort = () => done(new Error('OPS_EXEC_CANCELLED_REMOTE_TERMINATION_UNCONFIRMED'));
      const timer = setTimeout(() => done(new Error('OPS_EXEC_TIMEOUT_REMOTE_TERMINATION_UNCONFIRMED')), timeoutSeconds * 1000);
      signal?.addEventListener('abort', abort, { once: true });
      socket.on('error', () => done(new Error('OPS_EXEC_TRANSPORT_FAILED')));
      socket.on('unexpected-response', (_req, response) => { response.resume(); done(new Error(`OPS_EXEC_HTTP_${response.statusCode}`)); });
      socket.on('message', (data, binary) => {
        if (settled) return;
        if (!binary || !data.length) return done(new Error('OPS_EXEC_PROTOCOL_ERROR'));
        const channel = data[0], bytes = data.subarray(1);
        if (channel === 1 || channel === 2) {
          outputBytes += bytes.length;
          if (outputBytes > maxOutputBytes) return done(new Error('OPS_EXEC_OUTPUT_LIMIT_REMOTE_TERMINATION_UNCONFIRMED'));
          (channel === 1 ? stdout : stderr).push(bytes);
        } else if (channel === 3) {
          statusBytes += bytes.length;
          if (statusBytes > 8192 || status) return done(new Error('OPS_EXEC_PROTOCOL_ERROR'));
          try { status = JSON.parse(bytes.toString('utf8')); } catch { return done(new Error('OPS_EXEC_PROTOCOL_ERROR')); }
        } else { done(new Error('OPS_EXEC_PROTOCOL_ERROR')); }
      });
      socket.on('close', () => {
        if (settled) return;
        if (!status) return done(new Error('OPS_EXEC_STATUS_MISSING'));
        const exit = status.status === 'Success' ? 0 : Number(status.details?.causes?.find(c => c.reason === 'ExitCode')?.message);
        if (!Number.isInteger(exit) || exit < 0 || exit > 255) return done(new Error('OPS_EXEC_STATUS_INVALID'));
        done(null, { namespace, pod, container, exitCode: exit, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      });
      if (signal?.aborted) abort();
    });
  };
}
