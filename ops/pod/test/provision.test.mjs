import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { opsMcpCredentialDiffs } from '../../../scripts/ops-mcp-gitops.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const values = parseAllDocuments(readFileSync(root + 'charts/ops-pod/values.yaml', 'utf8'))[0].toJSON();
const render = extra => parseAllDocuments(execFileSync('helm', ['template', 'codex-ops', root + 'charts/ops-pod', '-n', 'kubeclaw-ops',
  '--set-string', 'codexImage=example/codex@sha256:' + 'a'.repeat(64), '--set-string', 'mcpImage=example/mcp@sha256:' + 'b'.repeat(64),
  '--set', 'networkPolicy.apiServerCIDRs[0]=10.0.0.1/32', ...extra], { encoding: 'utf8' })).map(doc => {
  assert.deepEqual(doc.errors, []); return doc.toJSON();
}).filter(Boolean);

test('Argo rendering is deterministic and provisions credentials before workloads without broad Secret authority', () => {
  const first = render([]), second = render([]);
  assert.deepEqual(first, second, 'no randAlphaNum, Helm lookup or generated certificate bytes in rendered Git manifests');
  const job = first.find(x => x.kind === 'Job');
  assert.equal(job.metadata.annotations['argocd.argoproj.io/hook'], 'Sync');
  assert.equal(job.metadata.annotations['argocd.argoproj.io/sync-wave'], '-1');
  const pod = job.spec.template.spec;
  assert.equal(pod.serviceAccountName, 'codex-ops-mcp-provisioner');
  assert.equal(pod.automountServiceAccountToken, false);
  assert.deepEqual(pod.containers[0].command, ['node', '/app/src/provision.mjs']);
  const cron = first.find(x => x.kind === 'CronJob');
  assert.equal(cron.spec.concurrencyPolicy, 'Forbid');
  assert.equal(cron.spec.jobTemplate.spec.template.spec.serviceAccountName, pod.serviceAccountName);
  const objects = first.filter(x => x.kind === 'Secret' || (x.kind === 'ConfigMap' && x.metadata.name === values.mcp.caConfigMap));
  assert.ok(objects.length > 0);
  for (const object of objects) {
    assert.deepEqual(object.data, {});
    assert.equal(object.metadata.annotations['argocd.argoproj.io/sync-wave'], '-3');
    assert.equal(object.metadata.annotations['argocd.argoproj.io/sync-options'], 'Prune=false');
  }
  const ca = objects.filter(x => x.kind === 'Secret' && x.metadata.name === values.mcp.provision.caSecret);
  assert.equal(ca.length, 1); assert.equal(ca[0].metadata.namespace, 'kubeclaw-ops');
  const roles = first.filter(x => x.kind === 'Role' && x.metadata.name.endsWith('-provisioner'));
  for (const role of roles) {
    for (const rule of role.rules) {
      assert.deepEqual(rule.verbs, ['get', 'patch']);
      assert.ok(rule.resourceNames.length > 0);
      assert.ok(!rule.resourceNames.includes('*'));
      for (const name of rule.resourceNames) {
        const kind = rule.resources[0] === 'secrets' ? 'Secret' : 'ConfigMap';
        assert.ok(objects.some(x => x.kind === kind && x.metadata.name === name && x.metadata.namespace === role.metadata.namespace));
      }
    }
  }
  const diffs = opsMcpCredentialDiffs('kubeclaw-ops', values.mcp);
  assert.deepEqual(diffs.map(x => [x.kind, x.namespace, x.name]).sort(), objects.map(x => [x.kind, x.metadata.namespace, x.metadata.name]).sort());
  assert.ok(diffs.every(x => x.name && x.namespace && x.jsonPointers.join() === '/data'));
  const mcp = first.find(x => x.kind === 'Deployment').spec.template.spec;
  assert.ok(!mcp.volumes.some(x => x.secret?.secretName === values.mcp.provision.caSecret), 'MCP must not receive the CA signing key');
  const codex = first.find(x => x.kind === 'StatefulSet').spec.template.spec;
  assert.ok(!codex.volumes.some(x => x.projected?.sources.some(source => source.serviceAccountToken)));
});

test('externally managed credentials disable provisioning and data-diff exceptions together', () => {
  const objects = render(['--set', 'mcp.provision.enabled=false']);
  assert.ok(!objects.some(x => ['Job', 'CronJob', 'Secret'].includes(x.kind)));
  assert.deepEqual(opsMcpCredentialDiffs('kubeclaw-ops', values.mcp, { provision: { enabled: false } }), []);
});
