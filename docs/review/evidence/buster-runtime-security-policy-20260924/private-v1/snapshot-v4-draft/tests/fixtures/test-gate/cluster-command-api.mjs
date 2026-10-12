/** Real executable/stdio boundary, modeled Kubernetes and Tailscale responses.
 * No cluster access, command hook, forwarding replacement, or provider mock. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeSecurityResultDigest } from '../../../skills/buster/engine/test-gates/kubernetes-runtime-security.ts';

export function clusterCommandApi(root, hostname = 'preview.ts.net') {
  const log = path.join(root, 'commands.jsonl');
  const state = path.join(root, 'lease.json');
  const executable = path.join(root, 'kubectl-local');
  const source = fs.readFileSync(fileURLToPath(new URL('./cluster-command-program.cjs', import.meta.url)), 'utf8');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fixture = ${JSON.stringify({ log, state, hostname })};\n${source}`, { mode: 0o700, flag: 'wx' });
  const seed = (namespace = 'test-one', security = null) => fs.writeFileSync(state, JSON.stringify({
    metadata: { name: 'test-one', resourceVersion: '1', generation: 1, annotations: {} },
    spec: { namespaceName: namespace, serviceName: 'app', servicePort: 8080 },
    ...(security ? { padding: 'x'.repeat(security.padding) } : {}),
    status: { ...(security ? { runtimeSecurity: { ...security.snapshot, resultDigest: runtimeSecurityResultDigest(security.snapshot) } } : {}),
      phase: 'Ready', namespaceName: namespace, createdAt: '2026-09-21T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
  }));
  seed();
  return { executable, seed, responseBytes: () => fs.statSync(state).size, calls: () => fs.existsSync(log)
    ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] };
}

export const exposureRequest = {
  operation: 'prepare', resource: { type: 'kubernetes.exposure', canonicalId: 'kubernetes-exposure:attempt:one' },
  payload: { leaseName: 'test-one', namespace: 'test-one', serviceName: 'app', servicePort: 8080,
    expiresAt: '2099-01-01T00:00:00.000Z', path: '/', readinessTimeoutMs: 1000 },
};
