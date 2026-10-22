// Trusted platform reconciler, never exposed as an MCP tool. Agents have no
// access to this identity. Admission additionally limits every binding write.
import { request } from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { namespaceAllowed } from './access-policy.mjs';
import { createKubeList } from './kubernetes.mjs';

const dns = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function validateNamespaceAccess(config) {
  if (![config.namespace, config.serviceAccount].every(x => typeof x === 'string' && dns.test(x)) ||
      !Array.isArray(config.prefixes) || !config.prefixes.length || !config.prefixes.every(x => typeof x === 'string' && dns.test(x)) ||
      !Array.isArray(config.roles) || config.roles.length !== 2 || !config.roles.every(x => typeof x === 'string' && /^[a-z0-9-]{1,200}$/.test(x))) {
    throw new Error('INVALID_NAMESPACE_ACCESS_CONFIG');
  }
  return config;
}

export function createNamespaceAccessRequest(config, {
  api = process.env.KUBERNETES_API_URL ?? 'https://kubernetes.default.svc',
  tokenFile = process.env.KUBERNETES_TOKEN_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
  caFile = process.env.KUBERNETES_CA_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
} = {}) {
  validateNamespaceAccess(config);
  const origin = new URL(api);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_API_ORIGIN');
  return (method, path, body) => {
    const list = method === 'GET' && /^\/api\/v1\/namespaces\?(?:limit=\d+)(?:&continue=[A-Za-z0-9%._~-]+)?$/.test(path);
    const target = /^\/apis\/rbac.authorization.k8s.io\/v1\/namespaces\/([a-z0-9-]+)\/rolebindings(?:\/([a-z0-9-]+))?$/.exec(path);
    if (!list && !(target && namespaceAllowed(target[1], [], config.prefixes) &&
      ((method === 'POST' && !target[2] && config.roles.includes(body?.metadata?.name)) ||
       (['GET', 'PATCH'].includes(method) && config.roles.includes(target[2]))))) throw new Error('INVALID_NAMESPACE_ACCESS_REQUEST');
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token || /\s/.test(token)) throw new Error('INVALID_API_CREDENTIAL');
    return new Promise((resolve, reject) => {
      const req = request(origin, { method, path, ca: readFileSync(caFile), rejectUnauthorized: true, agent: false,
        headers: { authorization: `Bearer ${token}`, accept: 'application/json',
          ...(body ? { 'content-type': method === 'PATCH' ? 'application/merge-patch+json' : 'application/json' } : {}) } }, res => {
        const chunks = []; let bytes = 0;
        res.on('data', chunk => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) req.destroy(new Error('NAMESPACE_ACCESS_RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`NAMESPACE_ACCESS_API_${res.statusCode}`); error.status = res.statusCode; return reject(error);
          }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('INVALID_NAMESPACE_ACCESS_RESPONSE')); }
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('NAMESPACE_ACCESS_TIMEOUT')), 10000);
      req.on('close', () => clearTimeout(timer)); req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  };
}

export async function reconcileNamespaceAccess(config, api) {
  validateNamespaceAccess(config);
  const list = createKubeList(path => api('GET', path));
  const namespaces = await list('/api/v1/namespaces', { mapItem: item => ({ name: item.metadata?.name, terminating: Boolean(item.metadata?.deletionTimestamp) }) });
  const failures = [];
  for (const ns of namespaces.items) {
    if (ns.terminating || !namespaceAllowed(ns.name, [], config.prefixes)) continue;
    for (const role of config.roles) {
      const collection = `/apis/rbac.authorization.k8s.io/v1/namespaces/${ns.name}/rolebindings`;
      const desired = { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding',
        metadata: { name: role, namespace: ns.name, labels: { 'ops.kubeclaw.io/namespace-access': 'true' } },
        roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: role },
        subjects: [{ kind: 'ServiceAccount', name: config.serviceAccount, namespace: config.namespace }] };
      try {
        let existing;
        try { existing = await api('GET', `${collection}/${role}`); }
        catch (error) { if (error.status !== 404) throw error; }
        if (!existing) await api('POST', collection, desired);
        else {
          // Never take over an unrelated object, or attempt to change immutable roleRef.
          if (existing.metadata?.labels?.['ops.kubeclaw.io/namespace-access'] !== 'true' ||
              !Object.entries(desired.roleRef).every(([key, value]) => existing.roleRef?.[key] === value)) throw new Error('NAMESPACE_ACCESS_BINDING_COLLISION');
          if (existing.subjects?.length !== 1 || !Object.entries(desired.subjects[0]).every(([key, value]) => existing.subjects[0]?.[key] === value) || existing.subjects[0]?.apiGroup) {
            await api('PATCH', `${collection}/${role}`, { metadata: { resourceVersion: existing.metadata.resourceVersion }, subjects: desired.subjects });
          }
        }
      } catch (error) {
        // A deleted namespace or a single collision must not starve other namespaces.
        failures.push({ namespace: ns.name, role, error: error.message });
      }
    }
  }
  if (failures.length) { const error = new Error('NAMESPACE_ACCESS_RECONCILE_FAILED'); error.failures = failures; throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = validateNamespaceAccess(JSON.parse(readFileSync('/etc/ops-namespace-access/config.json', 'utf8')));
  const api = createNamespaceAccessRequest(config);
  // Re-list every five seconds: covers pre-existing, newly created, recreated,
  // and drifted namespaces without per-namespace Git commits or label opt-in.
  while (true) {
    try { await reconcileNamespaceAccess(config, api); writeFileSync('/tmp/ready', String(Date.now())); }
    catch (error) { console.error(JSON.stringify({ type: 'ops-namespace-access', error: error.message, failures: error.failures })); }
    await delay(5000);
  }
}
