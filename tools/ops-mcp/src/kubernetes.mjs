import { request } from 'node:https';
import { readFileSync } from 'node:fs';

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

// One transport for pod and external operation. Credentials are re-read for
// every request so atomic token rotation does not require restarting the MCP.
export function createKubeRequest({
  api = process.env.KUBERNETES_API_URL ?? 'https://kubernetes.default.svc',
  tokenFile = process.env.KUBERNETES_TOKEN_FILE ?? `${SERVICE_ACCOUNT_DIR}/token`,
  caFile = process.env.KUBERNETES_CA_FILE ?? `${SERVICE_ACCOUNT_DIR}/ca.crt`,
  timeoutMs = 10_000,
  maxBytes = 8 * 1024 * 1024,
} = {}) {
  const origin = new URL(api);
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('KUBERNETES_API_URL must be an HTTPS origin without credentials or a path');
  }
  return async function kubeRequest(path, { asText = false } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Kubernetes API path');
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token || /\s/.test(token)) throw new Error('Invalid Kubernetes token file');
    const ca = readFileSync(caFile);
    return new Promise((resolve, reject) => {
      const req = request(origin, {
        method: 'GET', path, ca, rejectUnauthorized: true, agent: false,
        headers: { Authorization: `Bearer ${token}`, Accept: asText ? 'text/plain' : 'application/json' },
      }, res => {
        const chunks = [];
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            const error = new Error('Kubernetes response exceeds the byte limit; narrow the query');
            reject(error);
            req.destroy(error);
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          if (bytes > maxBytes) return;
          // Do not follow redirects with a credential, or return API error bodies
          // containing unrelated diagnostics. Tool callers get status + path.
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Kubernetes API ${res.statusCode}: ${path.split('?')[0]}`));
            return;
          }
          const body = Buffer.concat(chunks).toString('utf8');
          try { resolve(asText ? body : JSON.parse(body)); } catch { reject(new Error('Invalid Kubernetes JSON response')); }
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('Kubernetes API request timed out')), timeoutMs);
      req.on('close', () => clearTimeout(timer));
      req.on('error', reject);
      req.end();
    });
  };
}
