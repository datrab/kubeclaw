import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export function validateApiOrigins(origins) {
  if (!Array.isArray(origins) || origins.length < 2 || origins.length > 32 || new Set(origins).size !== origins.length) {
    throw new Error('API_SERVICE_AND_ENDPOINT_ORIGINS_REQUIRED');
  }
  for (const [index, origin] of origins.entries()) {
    const url = new URL(origin);
    validateHttpsOrigin(url);
    if (index === 0) {
      if (url.hostname !== 'kubernetes.default.svc' || url.port) throw new Error('API_PROBE_SERVICE_443_REQUIRED');
    } else if (!isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('API_PROBE_ENDPOINT_IP_REQUIRED');
  }
}

function validateHttpsOrigin(url) {
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_PROBE_HTTPS_ORIGIN_REQUIRED');
  }
}

/** Read-only probe run under the actual workload SA and CNI identity. */
export async function verifyKubernetesApiPaths(options) {
  const { namespace, serviceAccount, origins, tokenFile, caFile } = options;
  for (const value of [namespace, serviceAccount]) {
    if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value)) throw new Error('API_PROBE_IDENTITY_INVALID');
  }
  validateApiOrigins(origins);
  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  if (claims.sub !== `system:serviceaccount:${namespace}:${serviceAccount}`) throw new Error('API_PROBE_WRONG_SERVICE_ACCOUNT');
  const ca = fs.readFileSync(caFile);
  for (const origin of origins) {
    const url = new URL(origin);
    url.pathname = `/api/v1/namespaces/${namespace}/services`;
    url.search = '?limit=1';
    const body = await getApi(url, ca, token);
    if (body.kind !== 'ServiceList' || !Array.isArray(body.items)) throw new Error('API_PROBE_NOT_KUBERNETES_SERVICE_LIST');
  }
  return { ok: true, serviceAccount: claims.sub, checkedOrigins: origins,
    excluded: ['negative-private-target', 'CNI-drop-verdict', 'controller-reconciliation'] };
}

function getApi(url, ca, token) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, servername: 'kubernetes.default.svc', rejectUnauthorized: true,
      signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${token}` } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error(`API_PROBE_HTTP_${response.statusCode}`)); return; }
      const chunks = []; let size = 0;
      response.on('data', bytes => {
        size += bytes.length;
        if (size > 8 * 1024 * 1024) { response.destroy(new Error('API_PROBE_RESPONSE_LIMIT')); return; }
        chunks.push(bytes);
      });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('API_PROBE_RESPONSE_INVALID')); }
      });
    });
    request.on('error', reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: kubernetes-api-probe.mjs OPTIONS_JSON_FILE');
  const result = await verifyKubernetesApiPaths(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  process.stdout.write(JSON.stringify(result) + '\n');
}
