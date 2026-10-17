import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverContracts as metadata, implicitKubernetesObjectMetaReferences as implicit} from '../docs-kubernetes-metadata-receiver-contracts.mjs';
import {receiverContracts as envelope} from '../docs-kubernetes-envelope-receiver-contracts.mjs';
const get=(kind,path)=>metadata.find(record=>record.kind===kind&&record.fieldPath===path);
const clusterKinds=['ClusterRole','ClusterRoleBinding','IngressClass','CustomResourceDefinition'];

test('the four body providers have complete separate typed identity and metadata receivers',()=>{
 const referenceFields=metadata.filter(record=>record.kind==='Role').map(record=>record.fieldPath);
 for(const kind of clusterKinds){
  assert.deepEqual(metadata.filter(record=>record.kind===kind).map(record=>record.fieldPath),referenceFields);
  for(const field of ['apiVersion','kind']){
   const record=envelope.find(record=>record.kind===kind&&record.fieldPath===`$.${field}`);
   assert.ok(record);assert.match(record.omitted,/endpoint.*default/i);
   assert.ok(record.crossFieldConditions.some(condition=>/typed built-in.*CustomResourceDefinition registration/.test(condition)));
  }
 }
 assert.ok(implicit.every(reference=>!clusterKinds.includes(reference.kind)));
 assert.equal(new Set(metadata.map(record=>`${record.kind}:${record.fieldPath}`)).size,metadata.length);
});

test('RBAC positive and zero generation survives create without inventing revision tracking',()=>{
 for(const kind of ['ClusterRole','ClusterRoleBinding']){
  const record=get(kind,'$.metadata.generation');
  assert.match(record.omitted,/omission leaves zero/);
  assert.match(record.emptyValue,/0 is retained.*not replaced with 1/);
  assert.match(record.nullValue,/remains zero.*does not initialize/);
  assert.match(record.invalidValue,/Negative generation fails/);
  assert.ok(record.cases.some(c=>/positive generation/.test(c.condition)&&/does not reset/.test(c.sourceOutcome)));
  assert.ok(record.cases.some(c=>c.name==='Replacement generation'&&/restores the stored generation.*does not increment.*Deletion.*separate/.test(c.sourceOutcome)));
  assert.ok(!record.cases.some(c=>/create (?:sets|initializes) (?:generation )?1/i.test(c.sourceOutcome)));
 }
 const ingress=get('IngressClass','$.metadata.generation');
 assert.match(ingress.emptyValue,/replaced by the strategy/);
 assert.ok(ingress.crossFieldConditions.some(condition=>/create sets generation 1.*changed spec.*labels\/annotations alone do not/.test(condition)));
});

test('cluster scope and root object names do not borrow release or subject namespaces',()=>{
 for(const kind of clusterKinds){
  const record=get(kind,'$.metadata.namespace');
  assert.ok(record.cases.some(c=>c.name==='Cluster scope normalization'&&/clears the authored namespace/.test(c.sourceOutcome)));
 }
 for(const kind of ['ClusterRole','ClusterRoleBinding']){
  const name=get(kind,'$.metadata.name');
  assert.match(name.invalidValue,/exact \. or \.\..*\/ or %/);
  assert.ok(name.crossFieldConditions.some(condition=>/not DNS-subdomain grammar/.test(condition)));
  assert.ok(!name.crossFieldConditions.some(condition=>condition.startsWith('DNS-subdomain names use')));
 }
 assert.ok(get('IngressClass','$.metadata.name').crossFieldConditions.some(condition=>condition.startsWith('DNS-subdomain names use')));
});

test('typed CRD registration does not inherit custom-instance empty-managedFields coercion',()=>{
 const record=get('CustomResourceDefinition','$.metadata.managedFields');
 assert.match(record.emptyValue,/\[\].*reset/);
 assert.ok(!record.emptyValue.includes('coercion omits'));
 assert.ok(record.crossFieldConditions.some(condition=>/Typed managedFields:\[\] survives.*reset/.test(condition)));
 assert.ok(record.cases.some(c=>c.name==='Reset list versus null'&&/Typed \[\].*reset/.test(c.sourceOutcome)));
 assert.ok(!record.cases.some(c=>/CRD full create\/replacement coercion omits/.test(c.sourceOutcome)));
 assert.match(record.receiver,/typed built-in/);
 assert.ok(record.crossFieldConditions.some(condition=>/metadata\/spec.*self-to-self.*does not restore prior/.test(condition)));
});

test('CRD exact name and prefix cases agree with the plural.group validator',()=>{
 for(const path of ['$.metadata.name','$.metadata.generateName']){
  const record=get('CustomResourceDefinition',path);
  assert.match(record.invalidValue,/exactly spec.names.plural.*spec.group/);
  assert.ok(record.cases.some(c=>c.name==='Generated CRD registration name'&&/suffix.*rejects/.test(c.sourceOutcome)));
  assert.ok(!record.cases.some(c=>c.name==='Name collision retry'));
  assert.equal(record.cases.find(c=>c.name==='Omitted field').sourceOutcome,record.omitted);
  assert.equal(record.cases.find(c=>c.name==='Invalid or wrong token').sourceOutcome,record.invalidValue);
 }
 assert.ok(get('CustomResourceDefinition','$.metadata').crossFieldConditions.some(condition=>/kind and instance scope.*after.*Established/.test(condition)));
});

test('CRD status and first deletion retain actual server field ownership differences',()=>{
 const generation=get('CustomResourceDefinition','$.metadata.generation');
 assert.ok(generation.crossFieldConditions.some(condition=>/passes new metadata as both arguments.*does not restore old labels/.test(condition)));
 assert.ok(generation.cases.some(c=>c.name==='Registration first delete generation'&&/does not assign generation or grace/.test(c.sourceOutcome)));
 const finalizers=get('CustomResourceDefinition','$.metadata.finalizers');
 assert.ok(finalizers.crossFieldConditions.some(condition=>/First CRD DELETE|first CRD DELETE/.test(condition)&&/UID.*Terminating.*without generic grace assignment/.test(condition)));
 assert.ok(finalizers.crossFieldConditions.some(condition=>/later DELETE.*generic Store.Delete/.test(condition)));
 assert.ok(finalizers.crossFieldConditions.some(condition=>/Removing the cleanup token manually can bypass/.test(condition)));
 assert.ok(finalizers.evidence.some(e=>/customresourcedefinition\/etcd.go#L86-L179/.test(e.url)));
 assert.ok(metadata.filter(r=>clusterKinds.includes(r.kind)).every(r=>r.qualificationLimits.some(limit=>/no live/.test(limit))));
});

test('replacement concurrency, immutable lifetime and retained owner scope remain explicit',()=>{
 assert.ok(get('CustomResourceDefinition','$.metadata.resourceVersion').cases.some(c=>c.name==='Omitted version on replacement'&&/requires a version/.test(c.sourceOutcome)));
 for(const kind of ['ClusterRole','ClusterRoleBinding','IngressClass']) assert.ok(get(kind,'$.metadata.resourceVersion').cases.some(c=>c.name==='Omitted version on replacement'&&/permits unconditional/.test(c.sourceOutcome)));
 for(const kind of clusterKinds){
  assert.match(get(kind,'$.metadata.uid').invalidValue,/changed UID.*immutable/);
  assert.ok(get(kind,'$.metadata.ownerReferences').cases.some(c=>c.name==='Cluster dependent, namespaced owner'&&/invalid-scope.*forgets/.test(c.sourceOutcome)));
 }
});
