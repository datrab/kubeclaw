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
            error.code = 'KUBERNETES_RESPONSE_TOO_LARGE';
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

// Shared by workload and event pagination; failed attempts do not consume pages.
export function createKubeList(kubeRequest) {
  return async function kubeList(path, { pageSize = 500, params = {}, mapItem = item => item, maxPages = Infinity, continueToken = null } = {}) {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('pageSize must be a positive integer');
    let continuation = continueToken;
    const deadline = Number.isFinite(maxPages) ? Date.now() + 30_000 : Infinity;
    const items = [];
    let pages = 0;

    do {
      const query = new URLSearchParams(params);
      query.set('limit', String(pageSize));
      if (continuation) query.set('continue', continuation);

      let page;
      while (true) {
        try {
          page = await kubeRequest(`${path}?${query.toString()}`);
          break;
        } catch (error) {
          // Retry only oversized pages, preserving selectors and continuation.
          // Never relax the transport ceiling, and fail if even one item is too big.
          if (error.code !== 'KUBERNETES_RESPONSE_TOO_LARGE' || pageSize === 1 || Date.now() >= deadline) throw error;
          pageSize = Math.max(1, Math.floor(pageSize / 2));
          query.set('limit', String(pageSize));
        }
      }
      items.push(...(page.items ?? []).map(mapItem));
      pages += 1;
      continuation = page?.metadata?.continue || null;
    } while (continuation && pages < maxPages && Date.now() < deadline);

    return { items, pages, continuation, partial: Boolean(continuation) };
  };
}
