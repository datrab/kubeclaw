// Run by the operator after deployment, using this backend's real service
// account token and an authenticated Tailnet client. No cluster emulator.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createKubeRequest } from '../tools/ops-mcp/src/kubernetes.mjs';

const environment = process.env;
for (const name of ['KUBERNETES_API_URL', 'KUBERNETES_TOKEN_FILE', 'KUBERNETES_CA_FILE',
  'OPS_MCP_LIVE_URL', 'OPS_MCP_LIVE_TOKEN_FILE']) assert.ok(environment[name], `${name} is required`);
const namespace = environment.OPS_DEFAULT_NAMESPACE ?? 'kubeclaw';
const argocd = environment.ARGOCD_NAMESPACE ?? 'argocd';
const foreign = environment.OPS_MCP_DENIED_NAMESPACE ?? 'paperless';
for (const value of [namespace, argocd, foreign]) assert.match(value, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
assert.notEqual(foreign, namespace);
const token = readFileSync(process.env.KUBERNETES_TOKEN_FILE, 'utf8').trim();
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
assert.equal(claims.sub, `system:serviceaccount:${namespace}:kubeclaw-ops-mcp`, 'Use the actual Ops backend SA token');
const request = createKubeRequest();
for (const path of [`/api/v1/namespaces/${namespace}/pods?limit=1`,
  `/apis/apps/v1/namespaces/${namespace}/deployments?limit=1`,
  `/apis/argoproj.io/v1alpha1/namespaces/${argocd}/applications?limit=1`]) {
  await request(path);
}
for (const path of [`/api/v1/namespaces/${foreign}/pods?limit=1`,
  `/api/v1/namespaces/${namespace}/secrets?limit=1`, '/api/v1/nodes?limit=1']) {
  await assert.rejects(() => request(path), /Kubernetes API 403:/, 'Denied resources must return authorization denial, not connection failure');
}
const url = new URL(process.env.OPS_MCP_LIVE_URL);
assert.equal(url.protocol, 'https:');
assert.equal(url.pathname, '/mcp');
assert.ok(!url.username && !url.password && !url.search && !url.hash);
const bearer = readFileSync(process.env.OPS_MCP_LIVE_TOKEN_FILE, 'utf8').trim();
for (const [credential, status] of [[null, 401], ['invalid-local-proof-credential', 401], [bearer, 200]]) {
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
      ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  assert.equal(response.status, status);
  await response.arrayBuffer();
}
console.log(JSON.stringify({ ok: true, checks: ['real-service-account-allowed-reads', 'real-service-account-denied-reads',
  'tailnet-backend-authentication'], excluded: ['denied-tailnet-client', 'token-rotation', 'disaster-recovery'] }));
