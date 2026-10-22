// Argo/CronJob entrypoint. This is not an MCP tool and is never run by agents.
// Argo creates empty named objects; the job can GET/PATCH only those names.
import { request } from 'node:https';
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dns = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const decode = value => typeof value === 'string' ? Buffer.from(value, 'base64').toString('utf8') : '';
const encode = value => Buffer.from(value).toString('base64');

export function validateProvisionConfig(config) {
  for (const field of ['namespace', 'caSecret', 'tlsSecret', 'caConfigMap']) {
    if (typeof config[field] !== 'string' || !label.test(config[field])) throw new Error('INVALID_PROVISION_CONFIGURATION');
  }
  if (config.caSecret === config.tlsSecret || !Array.isArray(config.dnsNames) || !config.dnsNames.length ||
      !config.dnsNames.every(name => typeof name === 'string' && dns.test(name)) ||
      !Array.isArray(config.clients) || !config.clients.length || config.clients.length > 64) throw new Error('INVALID_PROVISION_CONFIGURATION');
  const ids = new Set(), secrets = new Set([config.caSecret, config.tlsSecret]);
  for (const client of config.clients) {
    if (![client.id, client.namespace, client.tokenSecret].every(name => typeof name === 'string' && label.test(name)) ||
        ids.has(client.id) || secrets.has(client.tokenSecret)) throw new Error('INVALID_PROVISION_CONFIGURATION');
    ids.add(client.id); secrets.add(client.tokenSecret);
  }
  return config;
}

export function createProvisionRequest({ api = process.env.KUBERNETES_API_URL ?? 'https://kubernetes.default.svc',
  tokenFile = process.env.KUBERNETES_TOKEN_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
  caFile = process.env.KUBERNETES_CA_FILE ?? '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt' } = {}) {
  const origin = new URL(api);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_API_ORIGIN');
  return (method, path, body) => {
    if (!['GET', 'PATCH'].includes(method) || !/^\/api\/v1\/namespaces\/[a-z0-9-]+\/(secrets|configmaps)\/[a-z0-9-]+$/.test(path)) throw new Error('INVALID_PROVISION_REQUEST');
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (!token || /\s/.test(token)) throw new Error('INVALID_API_CREDENTIAL');
    return new Promise((resolve, reject) => {
      const req = request(origin, { method, path, ca: readFileSync(caFile), rejectUnauthorized: true, agent: false,
        headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(method === 'PATCH' ? { 'content-type': 'application/json-patch+json' } : {}) } }, res => {
        const chunks = []; let bytes = 0;
        res.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) req.destroy(new Error('PROVISION_RESPONSE_TOO_LARGE')); else chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {
          // No redirects or API error bodies containing submitted Secret data.
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`PROVISION_API_${res.statusCode}`));
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('INVALID_PROVISION_RESPONSE')); }
        });
      });
      const timer = setTimeout(() => req.destroy(new Error('PROVISION_API_TIMEOUT')), 10000);
      req.on('close', () => clearTimeout(timer)); req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  };
}

function pairValid(cert, key, remainingDays = 0) {
  try {
    const certificate = new X509Certificate(cert);
    return certificate.checkPrivateKey(createPrivateKey(key)) &&
      Date.parse(certificate.validFrom) <= Date.now() && Date.parse(certificate.validTo) > Date.now() + remainingDays * 86400000;
  } catch { return false; }
}

export function issueCertificate(config, ca, openssl = '/usr/bin/openssl') {
  const dir = mkdtempSync(join(tmpdir(), 'ops-mcp-pki-'));
  const file = name => join(dir, name);
  const run = args => execFileSync(openssl, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  try {
    if (!ca) {
      run(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-days', '3650', '-keyout', file('key'), '-out', file('cert'),
        '-subj', '/CN=Ops MCP private service CA', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    } else {
      writeFileSync(file('ca.key'), ca.key, { mode: 0o600 }); writeFileSync(file('ca.crt'), ca.cert);
      run(['req', '-new', '-newkey', 'rsa:3072', '-nodes', '-keyout', file('key'), '-out', file('csr'), '-subj', '/CN=' + config.dnsNames[0]]);
      writeFileSync(file('extensions'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=' + config.dnsNames.map(name => 'DNS:' + name).join(',') + '\n');
      run(['x509', '-req', '-in', file('csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-set_serial', '0x' + randomBytes(16).toString('hex'),
        '-days', '90', '-extfile', file('extensions'), '-out', file('cert')]);
    }
    return { key: readFileSync(file('key'), 'utf8'), cert: readFileSync(file('cert'), 'utf8') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function provision(config, api = createProvisionRequest(), issue = issueCertificate) {
  validateProvisionConfig(config);
  const path = (namespace, kind, name) => `/api/v1/namespaces/${namespace}/${kind}/${name}`;
  const get = (namespace, kind, name) => api('GET', path(namespace, kind, name));
  const patchData = async (namespace, kind, name, object, fields) => {
    if (!object.metadata?.resourceVersion) throw new Error('PROVISION_OBJECT_VERSION_MISSING');
    // The optimistic test protects existing credentials when sync and renewal
    // jobs overlap. A conflict fails the job; Kubernetes retries from a fresh GET.
    return api('PATCH', path(namespace, kind, name), [
      { op: 'test', path: '/metadata/resourceVersion', value: object.metadata.resourceVersion },
      { op: 'add', path: '/data', value: { ...object.data, ...fields } },
    ]);
  };
  const seenTokens = new Set();
  for (const client of config.clients) {
    const source = await get(config.namespace, 'secrets', client.tokenSecret);
    const destination = client.namespace === config.namespace ? source : await get(client.namespace, 'secrets', client.tokenSecret);
    const first = decode(source.data?.token), second = decode(destination.data?.token);
    for (const value of [first, second]) if (value && !/^[A-Za-z0-9._~-]{32,512}$/.test(value)) throw new Error('INVALID_CLIENT_TOKEN');
    if (first && second && first !== second) throw new Error('CLIENT_TOKEN_COPIES_DIFFER');
    const token = first || second || randomBytes(48).toString('base64url');
    if (seenTokens.has(token)) throw new Error('CLIENT_CREDENTIALS_MUST_DIFFER');
    seenTokens.add(token);
    if (!first) await patchData(config.namespace, 'secrets', client.tokenSecret, source, { token: encode(token) });
    if (client.namespace !== config.namespace && !second) await patchData(client.namespace, 'secrets', client.tokenSecret, destination, { token: encode(token) });
  }
  const caObject = await get(config.namespace, 'secrets', config.caSecret);
  let ca = { cert: decode(caObject.data?.['tls.crt']), key: decode(caObject.data?.['tls.key']) };
  const leafObject = await get(config.namespace, 'secrets', config.tlsSecret);
  if (!ca.cert && !ca.key) {
    if (leafObject.data?.['tls.crt'] || leafObject.data?.['tls.key']) throw new Error('CA_MISSING_WITH_EXISTING_LEAF');
    ca = issue(config);
    await patchData(config.namespace, 'secrets', config.caSecret, caObject, { 'tls.crt': encode(ca.cert), 'tls.key': encode(ca.key) });
  }
  if (!pairValid(ca.cert, ca.key, 120) || !new X509Certificate(ca.cert).ca) throw new Error('INVALID_OR_EXPIRING_SERVICE_CA');
  // Publish the public CA only. The signing key never leaves the server namespace.
  for (const namespace of new Set([config.namespace, ...config.clients.map(client => client.namespace)])) {
    const object = await get(namespace, 'configmaps', config.caConfigMap);
    if (object.data?.['ca.crt'] !== ca.cert) await patchData(namespace, 'configmaps', config.caConfigMap, object, { 'ca.crt': ca.cert });
  }
  let leaf = { cert: decode(leafObject.data?.['tls.crt']), key: decode(leafObject.data?.['tls.key']) };
  let valid = pairValid(leaf.cert, leaf.key, 30);
  if (valid) {
    const certificate = new X509Certificate(leaf.cert);
    valid = certificate.verify(new X509Certificate(ca.cert).publicKey) && config.dnsNames.every(name => certificate.checkHost(name));
  }
  if (!valid) {
    leaf = issue(config, ca);
    if (!pairValid(leaf.cert, leaf.key, 30)) throw new Error('ISSUED_CERTIFICATE_INVALID');
    await patchData(config.namespace, 'secrets', config.tlsSecret, leafObject, { 'tls.crt': encode(leaf.cert), 'tls.key': encode(leaf.key) });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(readFileSync(process.env.OPS_MCP_PROVISION_FILE ?? '/etc/ops-provision/config.json', 'utf8'));
    await provision(config);
    console.log('Ops MCP client credentials and TLS trust are ready.');
  } catch {
    // OpenSSL/API errors can contain sensitive input. Keep the job log generic.
    console.error('Ops MCP provisioning failed; check named object readiness, RBAC, certificate validity and credential-copy consistency.');
    process.exitCode = 1;
  }
}
