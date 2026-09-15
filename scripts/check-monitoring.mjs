#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const read = file => yaml.load(fs.readFileSync(path.join(root, file), 'utf8'));
const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
const project = read('gitops/platform/bootstrap/monitoring-project.yaml');
const renders = {};
for (const name of ['prometheus', 'loki', 'alloy', 'promtail']) {
  const app = read(`gitops/platform/bootstrap/${name}.yaml`);
  assert.equal(app.spec.syncPolicy.automated, undefined);
  assert.ok(app.spec.syncPolicy.syncOptions.includes('ServerSideApply=true'));
  const source = app.spec.sources[0];
  assert.equal(source.targetRevision, versions.monitoringCharts[name].version);
  assert.ok(project.spec.sourceRepos.includes(source.repoURL));
  const values = source.helm.valueFiles[0].replace('$values/', '');
  const rendered = process.env.MONITORING_RENDER_DIR
    ? fs.readFileSync(path.join(process.env.MONITORING_RENDER_DIR, `${name}-render.yaml`), 'utf8')
    : execFileSync(process.env.HELM_BIN ?? 'helm', ['template', name, source.chart, '--repo', source.repoURL,
      '--version', source.targetRevision, '--namespace', 'monitoring', '--include-crds', '-f', path.join(root, values)],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180000 });
  renders[name] = yaml.loadAll(rendered).filter(Boolean);
  for (const doc of renders[name]) {
    if (doc.metadata.namespace) assert.ok(['monitoring', 'kube-system'].includes(doc.metadata.namespace));
    if (['ClusterRole', 'ClusterRoleBinding', 'CustomResourceDefinition', 'MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration'].includes(doc.kind)) {
      assert.ok(project.spec.clusterResourceWhitelist.some(rule => rule.kind === doc.kind && rule.group === doc.apiVersion.split('/')[0]));
    }
  }
}
const find = (app, kind, name) => {
  const doc = renders[app].find(item => item.kind === kind && item.metadata.name === name);
  assert.ok(doc, `${app}: missing ${kind}/${name}`);
  return doc;
};
const grafana = find('prometheus', 'Deployment', 'prometheus-grafana');
const grafanaEnv = grafana.spec.template.spec.containers.find(item => item.name === 'grafana').env;
for (const [name, key] of [['GF_SECURITY_ADMIN_USER', 'admin-user'], ['GF_SECURITY_ADMIN_PASSWORD', 'admin-password']]) {
  assert.deepEqual(grafanaEnv.find(item => item.name === name).valueFrom.secretKeyRef, { name: 'prometheus-grafana', key });
}
assert.ok(!renders.prometheus.some(item => item.kind === 'Secret' && item.metadata.name === 'prometheus-grafana'));
assert.equal(find('prometheus', 'PersistentVolumeClaim', 'prometheus-grafana').spec.resources.requests.storage, '5Gi');
assert.equal(find('prometheus', 'Service', 'prometheus-grafana').spec.ports[0].nodePort, 30030);
const prometheus = find('prometheus', 'Prometheus', 'prometheus-kube-prometheus-prometheus');
assert.equal(prometheus.spec.storage.volumeClaimTemplate.spec.resources.requests.storage, '20Gi');
assert.equal(prometheus.spec.retention, '15d');
assert.ok(renders.prometheus.filter(item => item.kind === 'CustomResourceDefinition').length >= 10);
const loki = find('loki', 'StatefulSet', 'loki');
assert.equal(loki.spec.serviceName, 'loki-headless');
assert.equal(loki.spec.podManagementPolicy, 'Parallel');
assert.deepEqual(loki.spec.selector.matchLabels, {
  'app.kubernetes.io/name': 'loki', 'app.kubernetes.io/instance': 'loki', 'app.kubernetes.io/component': 'single-binary',
});
assert.equal(loki.spec.volumeClaimTemplates[0].metadata.name, 'storage');
assert.equal(loki.spec.volumeClaimTemplates[0].spec.resources.requests.storage, '20Gi');
assert.notEqual(loki.spec.persistentVolumeClaimRetentionPolicy?.whenDeleted, 'Delete');
const config = yaml.load(find('loki', 'ConfigMap', 'loki').data['config.yaml']);
assert.equal(config.schema_config.configs[0].schema, 'v13');
assert.equal(config.schema_config.configs[0].object_store, 'filesystem');
assert.equal(config.limits_config.retention_period, '720h');
const alloy = find('alloy', 'DaemonSet', 'alloy');
const container = alloy.spec.template.spec.containers.find(item => item.name === 'alloy');
assert.equal(new Set(container.env.map(item => item.name)).size, container.env.length, 'No duplicate Alloy environment variables');
assert.equal(container.env.find(item => item.name === 'HOSTNAME').valueFrom.fieldRef.fieldPath, 'spec.nodeName');
assert.equal(alloy.spec.template.spec.volumes.find(item => item.name === 'positions').hostPath.path, '/var/lib/kubeclaw-alloy');
assert.equal(alloy.spec.template.spec.volumes.find(item => item.name === 'promtail-positions').hostPath.path, '/run/promtail');
const alloyConfig = find('alloy', 'ConfigMap', 'alloy').data['config.alloy'];
assert.match(alloyConfig, /legacy_positions_file\s*=\s*"\/run\/promtail\/positions.yaml"/);
assert.match(alloyConfig, /stage\.cri/);
assert.match(alloyConfig, /spec.nodeName=/);
assert.equal(find('promtail', 'DaemonSet', 'promtail').spec.template.spec.nodeSelector['kubeclaw.io/log-collector'], 'promtail-retired');
if (process.argv.includes('--validate-alloy')) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-alloy-check-'));
  try {
    fs.writeFileSync(path.join(temporary, 'config.alloy'), alloyConfig);
    execFileSync('docker', ['run', '--rm', '-v', `${temporary}:/proof:ro`, container.image, 'validate', '/proof/config.alloy'], { stdio: 'inherit', timeout: 180000 });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
console.log('PASS: monitoring charts, retained storage and credentials, CRDs, and log collector handover');
