import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { KubernetesFixtureCapabilityInvoker } from '../../../skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts';
import { boundedManifestDocuments } from '../../../skills/buster/engine/test-gates/kubernetes-manifest.ts';

// Child heap and deadline independently bound regressions in the original parent invoker.
if (process.argv[2] === 'child') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-yaml-budget-'));
  try {
    const executable = execFileSync('which', ['kubectl'], { encoding: 'utf8' }).trim();
    const capability = new KubernetesFixtureCapabilityInvoker({ workspaceRoot: root, kubectlExecutable: executable,
      controllerNamespace: 'kubeclaw', leaseApiGroup: 'kubeclaw.forgestack.ai', leaseApiVersion: 'v1alpha1',
      allowedNamespacePrefixes: ['test'], allowedRegistryPrefixes: ['registry.local/app'], allowedSecretReferences: [],
      allowedStorageClasses: ['fast'], allowDefaultStorageClass: false,
      maximumPersistentVolumeClaimBytes: 1024 ** 3, maximumPersistentVolumeTotalBytes: 1024 ** 3,
      maximumManifestBytes: 1024 * 1024, maximumResources: 8, maximumRetentionSeconds: 3600, maximumExecutionMs: 10_000 });
    let dag = 'a: &a {kind: List, items: []}\n';
    let previous = 'a';
    for (let index = 0; index < 25; index += 1) { const name = `n${index}`; dag += `${name}: &${name} {kind: List, items: [*${previous}, *${previous}]}\n`; previous = name; }
    dag += `kind: List\nitems: [*${previous}]\n`;
    const cases = [
      ['cycle', '&a {kind: List, items: [*a]}', /MANIFEST_ALIAS_CYCLE/],
      ['depth', '{kind: List, items: ['.repeat(1000) + ']}' .repeat(1000), /MANIFEST_PARSE_FAILED: KUBERNETES_FIXTURE_MANIFEST_COMPLEXITY_LIMIT/],
      ['dag', dag, /MANIFEST_ALIAS_LIMIT|MANIFEST_COMPLEXITY_LIMIT/],
      ['resources', 'kind: List\nitems:\n' + '  - {apiVersion: v1, kind: ConfigMap, metadata: {name: item}}\n'.repeat(9), /RESOURCE_COUNT_INVALID/],
    ];
    for (const [name, text, expected] of cases) {
      const file = path.join(root, `${name}.yaml`); fs.writeFileSync(file, text);
      const digest = `sha256:${'a'.repeat(64)}`;
      await assert.rejects(capability.invoke('kubernetes.fixture', { operation: 'prepare',
        resource: { type: 'kubernetes.fixture', canonicalId: `kubernetes-fixture:attempt:${name}` }, payload: {
          leaseName: 'test-example', namespaceName: 'test-example', namespacePrefix: 'test', project: 'test',
          immutableImage: `registry.local/app@${digest}`, imageDigest: digest, manifestPath: file,
          manifestDigest: `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`,
          serviceName: 'app', servicePort: 8080, secretReferences: [],
        } }, new AbortController().signal), expected);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
} else {
  test('original invoker bounds cycles, deep Lists, alias DAGs and resource expansion before kubectl', () => {
    execFileSync(process.execPath, ['--max-old-space-size=128', import.meta.filename, 'child'], { timeout: 15_000, stdio: 'pipe' });
  });
  test('ordinary shared YAML aliases retain their content', () => {
    const [document] = boundedManifestDocuments(Buffer.from('first: &value {name: ordinary}\nsecond: *value\n'));
    assert.deepEqual(document, { first: { name: 'ordinary' }, second: { name: 'ordinary' } });
  });
}
