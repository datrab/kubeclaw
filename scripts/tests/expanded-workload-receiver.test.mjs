import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {discoverShellApiOutputs,discoverTransformedApiOutputs} from '../docs-api-output-discovery.mjs';
import {yamlFieldPath} from '../yaml-field-path.mjs';
import {receiverContracts,workloadReceiverContracts as select,delegatedRootContracts} from '../docs-kubernetes-workload-receiver-contracts.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const get=(kind,path)=>{const record=receiverContracts.find(r=>r.kind===kind&&r.fieldPath===path);assert.ok(record,`${kind}:${path}`);return record;};
const fields=(value)=>{
 const paths=[];
 function visit(node,tokens=[]){if(tokens.length)paths.push(yamlFieldPath(tokens));if(node&&typeof node==='object')for(const [key,child] of Object.entries(node))visit(child,[...tokens,Array.isArray(node)?Number(key):key]);}
 visit(value);return paths;
};
test('actual root BuildKit shell output joins exact selected fields and fails closed on add/rename',()=>{
 const output=discoverShellApiOutputs(root).find(item=>item.context.kind==='Pod'&&item.context.path==='scripts/deploy.sh');
 assert.ok(output);assert.equal(output.context.requestConstructor,'cmd_buildkit_preflight');assert.equal(output.context.requestOperation,'kubectl-apply');
 const selected=select('v1','Pod',fields(output.value));
 assert.equal(selected.length,fields(output.value).filter(p=>!p.startsWith('$.metadata')&&!['$.kind','$.apiVersion'].includes(p)).length);
 assert.ok(selected.some(r=>r.fieldPath==='$.spec.containers[0].securityContext.capabilities.add[0]'));
 assert.ok(selected.every(r=>r.fieldPath===r.authoritySelector.fieldPath&&r.authoritySelector.apiVersion==='v1'));
 const added=structuredClone(output.value);added.spec.unreviewedBuildkitOption=true;
 assert.throws(()=>select('v1','Pod',fields(added)),/EXPANDED_WORKLOAD_RECEIVER_GAP.*unreviewedBuildkitOption/);
 const renamed=structuredClone(output.value);renamed.spec.containers[0].securityContext.appArmorChoice=renamed.spec.containers[0].securityContext.appArmorProfile;delete renamed.spec.containers[0].securityContext.appArmorProfile;
 assert.throws(()=>select('v1','Pod',fields(renamed)),/EXPANDED_WORKLOAD_RECEIVER_GAP.*appArmorChoice/);
});
test('actual registry garbage-collection transformed Jobs preserve finite restart and immutable child template',()=>{
 const outputs=discoverTransformedApiOutputs(root).filter(item=>item.context.kind==='Job'&&item.context.path==='scripts/render-registry-local.mjs');
 assert.equal(outputs.length,2);
 for(const output of outputs){
  assert.equal(output.value.spec.template.spec.restartPolicy,'Never');assert.equal(output.value.spec.backoffLimit,0);
  const selected=select('batch/v1','Job',fields(output.value));assert.ok(selected.length);
  assert.ok(selected.every(r=>r.authoritySelector.kind==='Job'));
  assert.match(selected.find(r=>r.fieldPath==='$.spec.template.spec.containers[0].args[0]').changeImpact,/immutable/);
 }
});
test('bounded exact key and index selection preserves caller authority and rejects new descendants/version',()=>{
 for(const [version,kind,path] of [
  ['apps/v1','StatefulSet','$.spec.template.spec.nodeSelector["kubernetes.io/hostname"]'],
  ['apps/v1','StatefulSet','$.spec.template.spec.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[0].podAffinityTerm.labelSelector.matchLabels["app.kubernetes.io/name"]'],
  ['batch/v1','Job','$.spec.template.spec.initContainers[1].securityContext.runAsUser'],
  ['v1','Pod','$.spec.containers[0].securityContext.capabilities.add[1]'],
 ]){const [record]=select(version,kind,[path]);assert.equal(record.fieldPath,path);assert.deepEqual(record.authoritySelector,{apiVersion:version,kind,fieldPath:path});}
 for(const kind of ['StatefulSet','Job','Pod'])assert.throws(()=>select(kind==='StatefulSet'?'apps/v1':kind==='Job'?'batch/v1':'v1',kind,['$.spec.newPolicy']),/EXPANDED_WORKLOAD_RECEIVER_GAP/);
 assert.deepEqual(select('apps/v2','StatefulSet',['$.spec']),[]);assert.deepEqual(select('v2','Pod',['$.spec']),[]);
 assert.deepEqual(select('v1','Pod',['$.apiVersion','$.kind','$.metadata.labels["app.kubernetes.io/name"]']),[]);
 assert.match(delegatedRootContracts.ObjectMeta,/metadata-receiver/);assert.match(delegatedRootContracts.TypeMeta,/envelope-receiver/);
});
test('removing an authored selected contract creates a visible receiver gap',()=>{
 const index=receiverContracts.findIndex(r=>r.kind==='StatefulSet'&&r.fieldPath==='$.spec.template.spec.nodeSelector');
 assert.ok(index>=598);const [removed]=receiverContracts.splice(index,1);
 try{assert.throws(()=>select('apps/v1','StatefulSet',['$.spec.template.spec.nodeSelector']),/EXPANDED_WORKLOAD_RECEIVER_GAP/);}
 finally{receiverContracts.splice(index,0,removed);}
 assert.equal(select('apps/v1','StatefulSet',['$.spec.template.spec.nodeSelector']).length,1);
});
test('root Pod defaults, normal updates and consumers are qualified independently of templates',()=>{
 const spec=get('Pod','$.spec');assert.match(spec.omitted,/Root Pod defaulting/);assert.match(spec.invalidValue,/ResourceIsPod true/);
 const links=get('Pod','$.spec.enableServiceLinks');assert.match(links.omitted,/true.*stored template/);assert.match(links.emptyValue,/Explicit false.*master Services/);
 assert.match(get('Pod','$.spec.securityContext').omitted,/replaced.*empty PodSecurityContext/);
 assert.match(get('Pod','$.spec.containers[].image').invalidValue,/leading\/trailing whitespace.*actual Pod validation/);
 assert.match(get('Pod','$.spec.automountServiceAccountToken').omitted,/Pod choice wins.*ServiceAccount choice.*true/);
 assert.match(get('Pod','$.spec.serviceAccountName').omitted,/Missing account lookup rejects admission even when token automount is false/);
 for(const record of receiverContracts.filter(r=>r.kind==='Pod')){
  assert.match(record.operationScope,/cmd_buildkit_preflight.*kubectl apply/);
  assert.ok(record.evidence.some(e=>e.url.includes('/pkg/registry/core/pod/strategy.go')));
  assert.ok(!record.evidence.some(e=>/\/pkg\/(registry\/apps\/deployment|controller\/deployment)\//.test(e.url)));
  assert.match(record.changeImpact,/stored Pod.*update validation/);
 }
});
test('new StatefulSet/PDB/Job parent fields retain controller, gate, cleanup and identity limits',()=>{
 const max=get('StatefulSet','$.spec.updateStrategy.rollingUpdate.maxUnavailable');assert.match(max.omitted,/enabled.*disabled gate.*old/);assert.match(max.invalidValue,/positive.*100%/);
 const labels=get('StatefulSet','$.spec.volumeClaimTemplates[].metadata.labels[<exact-key>]');assert.match(labels.invalidValue,/Later generated PVC.*selector keys overwrite/);assert.match(labels.changeImpact,/immutable/);
 assert.match(get('Job','$.spec.template.metadata.name').invalidValue,/does not copy.*child Pod name/);
 assert.match(get('Job','$.spec.ttlSecondsAfterFinished').emptyValue,/zero.*finished Job.*asynchronous/);assert.match(get('Job','$.spec.ttlSecondsAfterFinished').changeImpact,/after deletion/);
 assert.match(get('PodDisruptionBudget','$.spec.maxUnavailable').invalidValue,/simultaneous minAvailable/);
});
test('legacy records remain unchanged outside independently identified correction boundaries',()=>{
 // Immutable5d baseline; only source-backed correctness corrections are excluded.
 const correctedIds=new Set(["Job:$.spec.activeDeadlineSeconds", "CronJob:$.spec.jobTemplate.spec.backoffLimit", "CronJob:$.spec.jobTemplate.spec.parallelism", "CronJob:$.spec.jobTemplate.spec.completions", "CronJob:$.spec.jobTemplate.spec.completionMode", "CronJob:$.spec.jobTemplate.spec.suspend", "CronJob:$.spec.jobTemplate.spec.activeDeadlineSeconds", "CronJob:$.spec.jobTemplate.spec.manualSelector", "CronJob:$.spec.jobTemplate.spec.template", "StatefulSet:$.spec.volumeClaimTemplates", "StatefulSet:$.spec.volumeClaimTemplates[]", "Job:$.spec.podReplacementPolicy", "CronJob:$.spec.jobTemplate.spec.podReplacementPolicy", "StatefulSet:$.spec.template", "StatefulSet:$.spec.revisionHistoryLimit", "StatefulSet:$.spec.template.spec", "StatefulSet:$.spec.template.spec.restartPolicy"]);
 const preserved=receiverContracts.slice(0,598).filter(r=>!correctedIds.has(r.kind+':'+r.fieldPath));
 assert.equal(createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),'87eafb01f453a795e07d72f80a438ac331a794be916b468d0abd5b0189cc8fdc');
 const corrected=get('StatefulSet','$.spec.revisionHistoryLimit');assert.match(corrected.invalidValue,/Negative values are accepted with a warning/);
 assert.match(corrected.changeImpact,/pruning.*non-live.*negative limit.*zero/);
 assert.equal(corrected.cases.find(c=>c.name==='invalid-value-or-combination').sourceOutcome,corrected.invalidValue);
 assert.ok(corrected.evidence.some(e=>e.url.endsWith('/pkg/registry/apps/statefulset/strategy.go#L143-L145')));
});
