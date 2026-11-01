import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessPolicy, parsePolicy, authorizeTool, authorizeExec } from '../src/access-policy.mjs';

const grant = { namespace: 'kubeclaw', podLabels: { app: 'buster' }, containers: ['runtime'], timeoutSeconds: 20, maxOutputBytes: 1000 };
const client = (id, tokenFile) => ({ id, tokenFile, namespaces: ['kubeclaw'], tools: ['get_pod', 'exec_pod'], exec: [grant] });

test('client identity, rotation, revocation and policy errors fail closed without shared-bearer fallback', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-policy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const policyFile = join(dir, 'policy.json');
  const codex = 'codex-' + 'c'.repeat(40), nova = 'nova-' + 'n'.repeat(40);
  writeFileSync(join(dir, 'codex'), codex); writeFileSync(join(dir, 'nova'), nova);
  const clients = [client('codex', join(dir, 'codex')), client('nova', join(dir, 'nova'))];
  writeFileSync(policyFile, JSON.stringify({ clients }));
  const config = { policyFile, namespaces: ['kubeclaw'], bearer: {} };
  const policy = createAccessPolicy(config);
  assert.equal(policy.authenticate(`Bearer ${codex}`).id, 'codex');
  assert.equal(policy.authenticate(`Bearer ${nova}`).id, 'nova');
  assert.equal(policy.authenticate(`Basic ${nova}`), null);
  assert.equal(policy.authenticate('Bearer unknown'), null);
  const rotated = 'rotated-' + 'z'.repeat(40);
  writeFileSync(join(dir, 'next'), rotated); renameSync(join(dir, 'next'), join(dir, 'nova'));
  assert.equal(policy.authenticate(`Bearer ${nova}`), null);
  assert.equal(policy.authenticate(`Bearer ${rotated}`).id, 'nova');
  writeFileSync(policyFile, JSON.stringify({ clients: [clients[0]] }));
  assert.equal(policy.authenticate(`Bearer ${rotated}`), null);
  assert.equal(policy.authenticate(`Bearer ${codex}`).id, 'codex');
  writeFileSync(policyFile, '{invalid');
  assert.equal(policy.ready(), false); assert.equal(policy.authenticate(`Bearer ${codex}`), null);
  writeFileSync(policyFile, JSON.stringify({ clients }));
  writeFileSync(join(dir, 'nova'), codex);
  assert.equal(policy.ready(), false, 'a shared token must never select the wrong identity');
  assert.throws(() => createAccessPolicy({ ...config, bearer: { token: codex } }), /combine/);
});

test('tool, namespace, pod label and exact container grants are independent boundaries', () => {
  const actor = client('nova', '/token');
  assert.doesNotThrow(() => authorizeTool(actor, 'get_pod', { namespace: 'kubeclaw' }, 'argocd'));
  assert.throws(() => authorizeTool(actor, 'platform_cluster_state', { resource: 'namespaces' }, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeTool(actor, 'get_pod', { namespace: 'argocd' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
  assert.throws(() => authorizeTool({ ...actor, tools: ['list_argocd_applications'] }, 'list_argocd_applications', {}, 'argocd'), /NAMESPACE_FORBIDDEN/);
  const args = { namespace: 'kubeclaw', pod: 'buster-1', container: 'runtime', timeoutSeconds: 100, maxOutputBytes: 9000 };
  const pod = { metadata: { labels: { app: 'buster' } }, spec: { containers: [{ name: 'runtime' }] } };
  assert.deepEqual(authorizeExec(actor, args, pod), { ...args, timeoutSeconds: 20, maxOutputBytes: 1000 });
  for (const changed of [{ namespace: 'argocd' }, { container: 'gateway' }]) assert.throws(() => authorizeExec(actor, { ...args, ...changed }, pod), /TARGET_FORBIDDEN/);
  assert.throws(() => authorizeExec(actor, args, { ...pod, metadata: { labels: { app: 'ops-mcp' } } }), /TARGET_FORBIDDEN/);
  assert.throws(() => authorizeExec(actor, args, { ...pod, spec: { containers: [] } }), /TARGET_FORBIDDEN/);
  assert.throws(() => parsePolicy(JSON.stringify({ clients: [{ ...actor, exec: [{ ...grant, podLabels: {} }] }] }), ['kubeclaw']), /grant/);
  assert.throws(() => parsePolicy(JSON.stringify({ clients: [{ ...actor, tools: ['*'] }] }), ['kubeclaw']), /policy/);
});

test('global namespace observation is explicit, discoverable, and never an implicit exec grant', () => {
  const ops = { ...client('codex', '/token'), readAllNamespaces: true, tools: ['get_pod', 'platform_cluster_state', 'exec_pod'] };
  const parsed = parsePolicy(JSON.stringify({ clients: [ops] }), ['kubeclaw'], [], true)[0];
  for (const namespace of ['production', 'future-namespace', 'kube-system', 'kubeclaw']) {
    assert.doesNotThrow(() => authorizeTool(parsed, 'get_pod', { namespace }, 'argocd'));
  }
  assert.doesNotThrow(() => authorizeTool(parsed, 'platform_cluster_state', { resource: 'namespaces' }, 'argocd'));
  assert.doesNotThrow(() => authorizeTool(parsed, 'platform_cluster_state', { resource: 'nodes', node: 'ax41-production' }, 'argocd'));
  assert.throws(() => authorizeTool(parsed, 'exec_pod', { namespace: 'production' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
  const pod = { metadata: { labels: { app: 'buster' } }, spec: { containers: [{ name: 'runtime' }] } };
  assert.throws(() => authorizeExec(parsed, { namespace: 'production', container: 'runtime' }, pod), /TARGET_FORBIDDEN/);
  for (const namespace of ['prod/../test', 'prod.example', '*', 'prod%2fother']) {
    assert.throws(() => authorizeTool(parsed, 'get_pod', { namespace }, 'argocd'), /NAMESPACE_FORBIDDEN/);
  }
  assert.throws(() => parsePolicy(JSON.stringify({ clients: [ops] }), ['kubeclaw']), /policy/);
  assert.throws(() => parsePolicy(JSON.stringify({ clients: [{ ...ops, readAllNamespaces: 'true' }] }), ['kubeclaw'], [], true), /policy/);
  const scoped = { ...ops, readAllNamespaces: false };
  assert.doesNotThrow(() => parsePolicy(JSON.stringify({ clients: [scoped] }), ['kubeclaw'], [], true));
  assert.doesNotThrow(() => authorizeTool(scoped, 'platform_cluster_state', { resource: 'nodes' }, 'argocd'));
  assert.throws(() => authorizeTool(scoped, 'platform_cluster_state', { resource: 'nodes', node: 'ax41-production' }, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeTool(scoped, 'platform_cluster_state', { resource: 'namespaces' }, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeTool(scoped, 'get_pod', { namespace: 'production' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
});

test('read-only identities reject exec at parsing and authorization, and global diagnostics cannot bypass namespace scope', () => {
  const observer = { ...client('codex', '/token'), readOnly: true, readAllNamespaces: true,
    tools: ['get_pod', 'get_resource_inventory', 'get_monitoring_metrics', 'get_monitoring_alerts'], exec: [] };
  assert.doesNotThrow(() => parsePolicy(JSON.stringify({ clients: [observer] }), ['kubeclaw'], [], true));
  for (const changed of [{ exec: [grant] }, { tools: [...observer.tools, 'exec_pod'] }, { readOnly: 'true' }]) {
    assert.throws(() => parsePolicy(JSON.stringify({ clients: [{ ...observer, ...changed }] }), ['kubeclaw'], [], true), /read.?only/i);
  }
  // Defense in depth even when a malformed principal reaches authorization.
  assert.throws(() => authorizeTool({ ...observer, tools: ['exec_pod'] }, 'exec_pod', {}, 'argocd'), /TOOL_FORBIDDEN/);
  assert.throws(() => authorizeExec({ ...observer, exec: [grant] }, { namespace: 'kubeclaw', container: 'runtime' }, {}), /TARGET_FORBIDDEN/);
  for (const tool of ['get_monitoring_metrics', 'get_monitoring_alerts']) {
    assert.doesNotThrow(() => authorizeTool(observer, tool, {}, 'argocd'));
    assert.throws(() => authorizeTool({ ...observer, readAllNamespaces: false }, tool, {}, 'argocd'), /TOOL_FORBIDDEN/);
  }
  for (const resource of ['persistentvolumes', 'storageclasses']) {
    assert.throws(() => authorizeTool({ ...observer, readAllNamespaces: false }, 'get_resource_inventory', { resource, namespace: 'kubeclaw' }, 'argocd'), /TOOL_FORBIDDEN/);
  }
  assert.throws(() => authorizeTool({ ...observer, readAllNamespaces: false }, 'get_resource_inventory', { resource: 'persistentvolumeclaims', namespace: 'other' }, 'argocd'), /NAMESPACE_FORBIDDEN/);
});

test('namespace-wide exact exec grants cover every regular container without matching adjacent namespaces', () => {
  const namespaceGrant = { namespace: 'kubeclaw', allPods: true, allContainers: true, timeoutSeconds: 30, maxOutputBytes: 65536 };
  const actor = { ...client('nova', '/token'), exec: [namespaceGrant] };
  const parse = value => parsePolicy(JSON.stringify({ clients: [value] }), ['kubeclaw', 'argocd'])[0];
  const parsed = parse(actor);
  const pod = { spec: { containers: [{ name: 'kubeclaw' }, { name: 'worker-trust-proxy' }], initContainers: [{ name: 'init' }] } };
  for (const container of ['kubeclaw', 'worker-trust-proxy']) {
    const args = { namespace: 'kubeclaw', container, timeoutSeconds: 120, maxOutputBytes: 999999 };
    assert.doesNotThrow(() => authorizeTool(parsed, 'exec_pod', args, 'argocd'));
    assert.deepEqual(authorizeExec(parsed, args, pod), { ...args, timeoutSeconds: 30, maxOutputBytes: 65536 });
  }
  for (const namespace of ['kubeclaw-ops', 'kubeclaw-other', 'argocd', 'production']) {
    assert.throws(() => authorizeExec(parsed, { namespace, container: 'kubeclaw' }, pod), /TARGET_FORBIDDEN/);
  }
  for (const container of ['missing', 'init']) {
    assert.throws(() => authorizeExec(parsed, { namespace: 'kubeclaw', container }, pod), /TARGET_FORBIDDEN/);
  }
  for (const changed of [{ allPods: false }, { allContainers: false }, { allPods: 'true' },
    { namespace: 'argocd' }, { namespacePrefix: 'test' }, { allNonSystemNamespaces: true },
    { podLabels: {} }, { containers: ['kubeclaw'] }]) {
    assert.throws(() => parse({ ...actor, exec: [{ ...namespaceGrant, ...changed }] }), /grant/);
  }
});


test('secret-custody workloads deny pod exec even to an explicitly broad operations client', () => {
 const client={readAllNamespaces:true,exec:[{allNonSystemNamespaces:true,allPods:true,allContainers:true,timeoutSeconds:120,maxOutputBytes:65536}]};
 const args={namespace:'familyclaw',pod:'receiver',container:'receiver',timeoutSeconds:30,maxOutputBytes:1024};
 const pod={metadata:{labels:{'security.kubeclaw.io/secret-custody':'true'}},spec:{containers:[{name:'receiver'}]}};
 assert.throws(()=>authorizeExec(client,args,pod),/OPS_EXEC_TARGET_FORBIDDEN/);
});
