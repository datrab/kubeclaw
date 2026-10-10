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
  ['apiextensions.k8s.io/v1', 'CustomResourceDefinition', '$.spec.versions[].subresources.scale'],
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
