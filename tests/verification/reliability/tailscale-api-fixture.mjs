import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

// Explicit Kubernetes wire-protocol fixture, not a controller or tailnet substitute.
export async function exposureAPI(root) {
  const group = 'kubeclaw.forgestack.ai';
  const state = { reads: 0, patches: [], autoObserve: true, observedAfterReads: 3, staleReads: 0, conflict: false,
    lease: { apiVersion: `${group}/v1alpha1`, kind: 'BusterNamespaceLease',
      metadata: { name: 'preview-one', namespace: 'kubeclaw', uid: 'lease-uid', resourceVersion: '1', generation: 1, annotations: {} },
      spec: { namespaceName: 'test-one', serviceName: 'web', servicePort: 80, purpose: 'gate', exposure: { provider: 'off' } },
      status: { phase: 'Ready', namespaceName: 'test-one', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: new Date().toISOString(), exposurePhase: 'Ready', exposureOwner: 'old', exposureGeneration: 1,
        previewUrl: 'https://old.ts.net/old', exposureHostname: 'old.ts.net' } },
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const url = new URL(request.url, 'http://localhost'); const route = url.pathname;
    const send = value => response.end(JSON.stringify(value));
    if (route === '/api') return send({ kind: 'APIVersions', apiVersion: 'v1', versions: ['v1'] });
    if (route === '/apis') return send({ kind: 'APIGroupList', apiVersion: 'v1', groups: [group, 'authorization.k8s.io'].map(name => ({ name,
      versions: [{ groupVersion: `${name}/${name === group ? 'v1alpha1' : 'v1'}`, version: name === group ? 'v1alpha1' : 'v1' }],
      preferredVersion: { groupVersion: `${name}/${name === group ? 'v1alpha1' : 'v1'}`, version: name === group ? 'v1alpha1' : 'v1' } })) });
    if (route === '/api/v1') return send({ kind: 'APIResourceList', apiVersion: 'v1', groupVersion: 'v1', resources: [] });
    if (route === `/apis/${group}/v1alpha1`) return send({ kind: 'APIResourceList', apiVersion: 'v1', groupVersion: `${group}/v1alpha1`, resources: [
      { name: 'busternamespaceleases', singularName: 'busternamespacelease', namespaced: true, kind: 'BusterNamespaceLease', verbs: ['get', 'patch'] }] });
    if (route === '/apis/authorization.k8s.io/v1') return send({ kind: 'APIResourceList', apiVersion: 'v1', groupVersion: 'authorization.k8s.io/v1', resources: [
      { name: 'selfsubjectaccessreviews', singularName: '', namespaced: false, kind: 'SelfSubjectAccessReview', verbs: ['create'] }] });
    if (route === '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews') return send({ apiVersion: 'authorization.k8s.io/v1', kind: 'SelfSubjectAccessReview', status: { allowed: true } });
    if (route === `/apis/${group}/v1alpha1/namespaces/kubeclaw/busternamespaceleases/preview-one`) {
      if (request.method === 'PATCH') {
        let bytes = ''; for await (const chunk of request) bytes += chunk;
        const patch = JSON.parse(bytes); state.patches.push(patch);
        if (state.conflict) {
          state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'] = 'concurrent-replacement';
          state.lease.metadata.resourceVersion = String(Number(state.lease.metadata.resourceVersion) + 1);
        }
        if (state.conflict || patch.metadata.resourceVersion !== state.lease.metadata.resourceVersion) {
          state.conflict = false; response.statusCode = 409;
          return send({ kind: 'Status', apiVersion: 'v1', status: 'Failure', reason: 'Conflict', code: 409, message: 'resource version changed' });
        }
        if (patch.metadata.annotations) Object.assign(state.lease.metadata.annotations, patch.metadata.annotations);
        Object.assign(state.lease.spec, patch.spec);
        state.lease.metadata.generation += 1;
        state.lease.metadata.resourceVersion = String(Number(state.lease.metadata.resourceVersion) + 1);
        state.staleReads = 0;
        state.onPatch?.(patch);
      } else {
        state.reads += 1; state.staleReads += 1;
        if (state.autoObserve && state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'] && state.staleReads >= state.observedAfterReads) {
          const off = state.lease.spec.exposure.provider === 'off';
          Object.assign(state.lease.status, { exposureOwner: state.lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'],
            exposureGeneration: state.lease.metadata.generation, exposurePhase: off ? 'Off' : 'Ready',
            exposureHostname: off ? null : 'preview.ts.net', previewUrl: off ? null : `https://preview.ts.net${state.lease.spec.exposure.path}` });
        }
      }
      return send(state.lease);
    }
    response.statusCode = 404; return send({ kind: 'Status', apiVersion: 'v1', reason: 'NotFound', code: 404, message: `unsupported wire route ${route}` });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const config = path.join(root, 'kubeconfig.json');
  fs.writeFileSync(config, JSON.stringify({ apiVersion: 'v1', kind: 'Config', clusters: [{ name: 'local-wire', cluster: { server: `http://127.0.0.1:${server.address().port}` } }],
    contexts: [{ name: 'local-wire', context: { cluster: 'local-wire', user: 'local-wire' } }], users: [{ name: 'local-wire', user: {} }], 'current-context': 'local-wire' }));
  return { state, config, close: () => new Promise(resolve => server.close(resolve)) };
}
