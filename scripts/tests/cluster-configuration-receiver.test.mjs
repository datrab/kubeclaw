import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverContracts, clusterConfigurationReceiverContracts as select} from '../docs-kubernetes-cluster-configuration-receiver-contracts.mjs';
const get = (kind, path) => receiverContracts.find(record => record.kind === kind && record.fieldPath === path);

test('selected cluster RBAC bodies join exact indices and delegate root identities', () => {
 const role = select('rbac.authorization.k8s.io/v1', 'ClusterRole', ['$.metadata.name', '$.apiVersion', '$.kind', '$.rules[2].apiGroups[0]', {fieldPath: '$.rules[2].resourceNames[0]'}]);
 assert.equal(role.length, 2);
 assert.equal(role[0].authoritySelector.fieldPath, '$.rules[2].apiGroups[0]');
 assert.match(role[0].emptyValue, /core API group/);
 assert.match(role[1].omitted, /Removing a member/);
 assert.deepEqual(select('rbac.authorization.k8s.io/v1', 'ClusterRoleBinding', ['$.metadata.labels["owner"]']), []);
 assert.deepEqual(select('other/v1', 'ClusterRole', ['$.rules']), []);
 assert.deepEqual(select('v1', 'Role', ['$.rules']), []);
});

test('newly selected fields and unreviewed foreign schema descendants fail closed', () => {
 for (const [version, kind, path] of [
  ['rbac.authorization.k8s.io/v1', 'ClusterRole', '$.rules[].future'],
  ['rbac.authorization.k8s.io/v1', 'ClusterRoleBinding', '$.roleRef.future'],
  ['networking.k8s.io/v1', 'IngressClass', '$.spec.parameters.name'],
  ['apiextensions.k8s.io/v1', 'CustomResourceDefinition', '$.spec.versions[].schema.openAPIV3Schema.properties["unused"].type'],
  ['apiextensions.k8s.io/v1', 'CustomResourceDefinition', '$.spec.versions[].subresources.scale.future'],
  ['apiextensions.k8s.io/v1', 'CustomResourceDefinition', '$.spec.conversion.webhook.clientConfig'],
 ]) assert.throws(() => select(version, kind, [path]), /CLUSTER_CONFIGURATION_RECEIVER_GAP/);
});

test('cluster binding cannot inherit namespaced RoleBinding subject or roleRef semantics', () => {
 assert.match(get('ClusterRoleBinding', '$.roleRef.kind').invalidValue, /Only ClusterRole.*Role rejects/);
 assert.match(get('ClusterRoleBinding', '$.subjects[].namespace').omitted, /rejects.*no binding-namespace fallback/);
 assert.match(get('ClusterRoleBinding', '$.subjects[].namespace').invalidValue, /does not independently check/);
 assert.match(get('ClusterRoleBinding', '$.roleRef.apiGroup').omitted, /defaults/);
 assert.match(get('ClusterRoleBinding', '$.subjects[].apiGroup').omitted, /stays empty/);
 assert.match(get('ClusterRoleBinding', '$.roleRef').changeImpact, /immutable.*uncertain write/);
 assert.match(get('ClusterRole', '$.rules[].resourceNames').omitted, /all names/);
 assert.match(get('ClusterRole', '$').changeImpact, /Storing the role alone grants nothing/);
});

test('CRD storage and serving choices preserve migration and lifecycle boundaries', () => {
 const flags = select('apiextensions.k8s.io/v1', 'CustomResourceDefinition', ['$.spec.versions[0].served', '$.spec.versions[0].storage']);
 assert.match(flags[0].omitted, /false.*not served/);
 assert.match(flags[0].invalidValue, /does not require served=true/);
 assert.match(flags[1].invalidValue, /Zero or multiple/);
 assert.ok(flags[1].crossFieldConditions.some(condition => /not complete data migration/.test(condition)));
 assert.match(get('CustomResourceDefinition', '$.spec.versions[]').omitted, /status.storedVersions/);
 assert.match(get('CustomResourceDefinition', '$.spec.scope').invalidValue, /after Established/);
 assert.ok(get('CustomResourceDefinition', '$.spec').crossFieldConditions.some(condition => /scope and kind.*after Established/.test(condition)));
 assert.match(get('CustomResourceDefinition', '$').changeImpact, /delete its instances/);
});

test('schema handoff and empty status marker are explicit registration contracts', () => {
 const schema = get('CustomResourceDefinition', '$.spec.versions[].schema.openAPIV3Schema');
 assert.equal(schema.foreignSchemaBoundary, true);
 assert.match(schema.upstreamSchemaAuthority.url, /types_jsonschema.go/);
 assert.ok(schema.crossFieldConditions.some(condition => /BusterNamespaceLease.*recursively maintained separately/.test(condition)));
 assert.match(schema.invalidValue, /nonstructural.*invalid defaults.*CEL/);
 const status = get('CustomResourceDefinition', '$.spec.versions[].subresources.status');
 assert.match(status.emptyValue, /enabling empty status structure/);
 assert.match(status.nullValue, /does not enable/);
 assert.match(get('CustomResourceDefinition', '$.spec.conversion').omitted, /strategy None/);
 assert.match(get('CustomResourceDefinition', '$.spec.conversion').emptyValue, /nonnil.*rejects/);
 assert.match(get('CustomResourceDefinition', '$.spec.names.listKind').omitted, /kind \+ List/);
 assert.match(get('CustomResourceDefinition', '$.spec.versions[].additionalPrinterColumns[].jsonPath').invalidValue, /does not prove/);
});

test('IngressClass controller remains immutable and controller execution stays unproven', () => {
 const controller = get('IngressClass', '$.spec.controller');
 assert.match(controller.invalidValue, /250.*update/);
 assert.match(controller.changeImpact, /does not prove.*installed/);
 assert.ok(controller.crossFieldConditions.some(condition => /warning and continues/.test(condition)));
 assert.ok(controller.evidence.some(evidence => /tailscale\/tailscale.*53a0d659/.test(evidence.url)));
 const pruning = get('CustomResourceDefinition', '$.spec.preserveUnknownFields');
 assert.match(pruning.omitted, /except at schema nodes/);
 assert.match(pruning.emptyValue, /existing true.*compatibility allowance/);
 assert.ok(receiverContracts.every(record => record.qualificationLimits.some(limit => /not live API/.test(limit))));
 assert.equal(new Set(receiverContracts.map(record => `${record.kind}:${record.fieldPath}`)).size, receiverContracts.length);
 assert.ok(receiverContracts.every(record => record.evidence.length >= 3 && record.cases.length === 5));
});

test('authentic selected producer CRDs traverse scale and registration status without schema expansion', async () => {
 const {default: YAML} = await import('yaml');
 const fs = await import('node:fs');
 const {createHash} = await import('node:crypto');
 const root = new URL('../../', import.meta.url);
 const raw = fs.readFileSync(new URL('gitops/platform/bootstrap/prometheus.yaml', root), 'utf8');
 assert.equal(createHash('sha256').update(raw).digest('hex'), 'd9c81c5644d744237997d336031cce970159da626024f3573cd7b4d0b55a7d44');
 const {execFileSync} = await import('node:child_process');
 const archive = new URL('scripts/vendor/external-helm-charts/10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1.tgz', root);
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), '10d54f6984e5f97b2e96e64440c7c0c37af2ed1b17c1521fa6c0da3529bdeec1');
 const rendered = execFileSync('helm', ['template', 'prometheus', archive.pathname, '--namespace', 'monitoring', '--include-crds', '--values', new URL('gitops/platform/values/prometheus.yaml', root).pathname], {encoding:'utf8', maxBuffer:20*1024*1024});
 const docs = YAML.parseAllDocuments(rendered).map(document => {assert.deepEqual(document.errors, []); return document.toJS();});
 function traverse(value, path, paths) {
  paths.push(path);
  if(value && typeof value === 'object') for(const [key, child] of Object.entries(value)) traverse(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, paths);
 }
 for(const index of [3, 9, 11]) {
  const doc = docs[index]; assert.equal(doc.kind, 'CustomResourceDefinition');
  const paths = [];
  traverse(doc.spec.versions[0].subresources.scale, '$.spec.versions[0].subresources.scale', paths);
  assert.equal(paths.length, 4);
  const selected = select(doc.apiVersion, doc.kind, paths);
  assert.equal(selected.length, paths.length);
  assert.deepEqual(selected.map(record => record.authoritySelector.fieldPath), paths);
  assert.equal(doc.spec.versions[0].subresources.scale.specReplicasPath, index === 3 ? '.spec.replicas' : '.spec.shards');
  assert.equal(doc.spec.versions[0].subresources.scale.statusReplicasPath, index === 3 ? '.status.replicas' : '.status.shards');
  assert.equal(doc.spec.versions[0].subresources.scale.labelSelectorPath, '.status.selector');
  const mutation = {...doc.spec.versions[0].subresources.scale, future: 'selected-new-field'};
  const changed = []; traverse(mutation, '$.spec.versions[0].subresources.scale', changed);
  assert.throws(() => select(doc.apiVersion, doc.kind, changed), /CLUSTER_CONFIGURATION_RECEIVER_GAP/);
 }
 const statusRaw = fs.readFileSync(new URL('gitops/platform/bootstrap/spire-crds.yaml', root), 'utf8');
 assert.equal(createHash('sha256').update(statusRaw).digest('hex'), '0e4d2e2b54c905eaa372749b99a8a2a65585a238875e5fa7c5ea880869276278');
 const spireArchive = new URL('scripts/vendor/external-helm-charts/e561d54dd2247552937f90c11e62a828ffcd85456a1b43162691500223bcac07.tgz', root);
 assert.equal(createHash('sha256').update(fs.readFileSync(spireArchive)).digest('hex'), 'e561d54dd2247552937f90c11e62a828ffcd85456a1b43162691500223bcac07');
 const statusRendered = execFileSync('helm', ['template', 'spire-crds', spireArchive.pathname, '--namespace', 'spire-system', '--include-crds'], {encoding:'utf8', maxBuffer:20*1024*1024});
 let statusCount = 0;
 for(const document of YAML.parseAllDocuments(statusRendered)) {
  assert.deepEqual(document.errors, []); const doc = document.toJS(); if(!doc || doc.kind !== 'CustomResourceDefinition') continue; statusCount++;
  const paths = []; traverse(doc.status, '$.status', paths);
  assert.equal(paths.length, 6); assert.equal(select(doc.apiVersion, doc.kind, paths).length, 6);
  assert.throws(() => select(doc.apiVersion, doc.kind, [...paths, '$.status.conditions[0].future']), /CLUSTER_CONFIGURATION_RECEIVER_GAP/);
 }
 assert.equal(statusCount, 3);
});

test('registration status and custom-instance scale use distinct operation contracts', () => {
 const registration = get('CustomResourceDefinition', '$.status');
 assert.ok(registration.crossFieldConditions.some(value => /create clears.*seeds/.test(value)));
 assert.ok(registration.crossFieldConditions.some(value => /replacement update preserves/.test(value)));
 assert.ok(registration.crossFieldConditions.some(value => /both arguments/.test(value)));
 assert.match(registration.invalidValue, /before status is cleared/);
 const history = get('CustomResourceDefinition', '$.status.storedVersions');
 assert.match(history.invalidValue, /status endpoint does not run/);
 const scale = get('CustomResourceDefinition', '$.spec.versions[].subresources.scale');
 assert.match(scale.emptyValue, /required replica paths.*rejects/);
 assert.match(scale.nullValue, /nil.*no scale endpoint/);
 assert.ok(scale.crossFieldConditions.some(value => /grants no permission.*replica completion/.test(value)));
 const desired = get('CustomResourceDefinition', '$.spec.versions[].subresources.scale.specReplicasPath');
 assert.match(desired.invalidValue, /GET errors.*status replicas yields zero/);
 const selector = get('CustomResourceDefinition', '$.spec.versions[].subresources.scale.labelSelectorPath');
 assert.match(selector.emptyValue, /accepted.*no selector path/);
 assert.match(selector.invalidValue, /wrong type errors.*does not parse/);
 assert.ok(scale.crossFieldConditions.some(value => /validator only checks/.test(value)));
});
