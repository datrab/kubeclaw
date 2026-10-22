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
  assert.throws(() => authorizeTool(actor, 'platform_cluster_state', {}, 'argocd'), /TOOL_FORBIDDEN/);
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
