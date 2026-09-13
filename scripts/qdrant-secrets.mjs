import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, X509Certificate, createPrivateKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function kubectl(args, input) {
  try {
    return execFileSync('kubectl', args, { input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { throw new Error('QDRANT_SECRET_KUBERNETES_REQUEST_FAILED'); }
}

function secret(namespace, name) {
  const value = kubectl(['get', 'secret', name, '-n', namespace, '--ignore-not-found', '-o', 'json']);
  if (!value.trim()) return null;
  const data = JSON.parse(value).data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Buffer.from(value, 'base64').toString('utf8')]));
}

export function validateQdrantCredentials(auth) {
  for (const key of ['api-key', 'read-only-api-key']) {
    if (!/^[A-Za-z0-9._~-]{32,512}$/.test(auth?.[key])) throw new Error('QDRANT_STRONG_API_KEYS_REQUIRED');
  }
  if (auth['api-key'] === auth['read-only-api-key']) throw new Error('QDRANT_DISTINCT_CLIENT_KEY_REQUIRED');
}

export function validateQdrantCertificate(tls, hostname) {
  if (!tls?.['tls.crt'] || !tls['tls.key'] || !tls['ca.crt']) throw new Error('QDRANT_TLS_SECRET_REQUIRED');
  const certificate = new X509Certificate(tls['tls.crt']);
  if (!certificate.subjectAltName || certificate.checkHost(hostname) !== hostname
    || !certificate.checkPrivateKey(createPrivateKey(tls['tls.key']))) throw new Error('QDRANT_TLS_IDENTITY_INVALID');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'qdrant-certificate-'));
  try {
    fs.writeFileSync(path.join(temporary, 'cert.pem'), tls['tls.crt'], { mode: 0o600 });
    fs.writeFileSync(path.join(temporary, 'ca.pem'), tls['ca.crt'], { mode: 0o600 });
    try {
      execFileSync('openssl', ['verify', '-CAfile', path.join(temporary, 'ca.pem'), '-untrusted', path.join(temporary, 'cert.pem'),
        '-purpose', 'sslserver', '-verify_hostname', hostname, path.join(temporary, 'cert.pem')], { stdio: 'pipe' });
    } catch { throw new Error('QDRANT_TLS_CHAIN_OR_VALIDITY_INVALID'); }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function prepareQdrantSecrets(namespace, createMissingAuth = false) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)) throw new Error('QDRANT_NAMESPACE_INVALID');
  validateQdrantCertificate(secret(namespace, 'qdrant-tls'), `qdrant.${namespace}.svc.cluster.local`);
  let auth = secret(namespace, 'qdrant-auth');
  if (!auth && createMissingAuth) {
    auth = { 'api-key': randomBytes(48).toString('base64url'), 'read-only-api-key': randomBytes(48).toString('base64url') };
    kubectl(['create', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'Secret',
      metadata: { name: 'qdrant-auth', namespace }, type: 'Opaque', stringData: auth }));
  }
  validateQdrantCredentials(auth);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, namespace] = process.argv.slice(2);
  if (!['check', 'ensure-auth'].includes(mode) || process.argv.length !== 4) throw new Error('Usage: qdrant-secrets.mjs check|ensure-auth NAMESPACE');
  prepareQdrantSecrets(namespace, mode === 'ensure-auth');
  process.stdout.write('Qdrant TLS identity and distinct API keys verified.\n');
}
