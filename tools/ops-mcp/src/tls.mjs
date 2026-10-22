import { readFileSync } from 'node:fs';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';

export function readTlsPair(certFile, keyFile) {
  const cert = readFileSync(certFile), key = readFileSync(keyFile);
  const certificate = new X509Certificate(cert);
  if (!certificate.checkPrivateKey(createPrivateKey(key)) || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
    throw new Error('Invalid or expired Ops MCP TLS pair');
  }
  return { cert, key, expires: Date.parse(certificate.validTo), fingerprint: createHash('sha256').update(cert).update(key).digest('hex') };
}

// Kubernetes Secret volumes rotate atomically. Re-read both paths and validate
// the pair before switching; a half-observed rotation never replaces the context.
export function reloadTls(server, certFile, keyFile, intervalMs = 10000) {
  let current = readTlsPair(certFile, keyFile);
  const refresh = () => {
    try {
      const next = readTlsPair(certFile, keyFile);
      if (next.fingerprint !== current.fingerprint) {
        server.setSecureContext({ cert: next.cert, key: next.key, minVersion: 'TLSv1.2' });
        current = next;
      }
      return true;
    } catch {
      console.error('Ops MCP TLS refresh failed; retaining the last valid context.');
      return false;
    }
  };
  const timer = setInterval(refresh, intervalMs); timer.unref();
  return { refresh, ready: () => current.expires > Date.now(), close: () => clearInterval(timer) };
}
